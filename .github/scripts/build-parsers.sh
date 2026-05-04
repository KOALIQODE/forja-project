#!/usr/bin/env bash
# build-parsers.sh — compiles every tree-sitter parser for the current platform
# and writes the shared libraries to $OUT_DIR.
#
# Usage: PLATFORM=linux-x86_64 OUT_DIR=dist bash build-parsers.sh
#
# Called by .github/workflows/build-parsers.yml on each runner.
# No Rust required — uses the system C/C++ compiler directly.

set -euo pipefail

PLATFORM="${PLATFORM:-$(uname -s | tr '[:upper:]' '[:lower:]')-$(uname -m)}"
OUT_DIR="${OUT_DIR:-dist}"
mkdir -p "$OUT_DIR"

# Detect shared library extension for this platform
case "$PLATFORM" in
  windows*) EXT="dll" ;;
  macos*)   EXT="dylib" ;;
  *)        EXT="so" ;;
esac

# Detect best available C compiler.
# Prefer clang — it handles tree-sitter's complex designated initializers
# better than GCC on all platforms (no "sorry, unimplemented" errors).
detect_compiler() {
  local need_cpp=$1
  if [ "$need_cpp" = "true" ]; then
    for cc in clang++ c++ g++; do
      if command -v "$cc" &>/dev/null; then echo "$cc"; return; fi
    done
    echo "ERROR: no C++ compiler found (clang++/c++/g++)" >&2; exit 1
  else
    for cc in clang cc gcc; do
      if command -v "$cc" &>/dev/null; then echo "$cc"; return; fi
    done
    echo "ERROR: no C compiler found (clang/cc/gcc)" >&2; exit 1
  fi
}

# List of parsers: "name|github_repo[|subdir[|branch]]"
# - subdir:  subdirectory inside the repo that contains src/parser.c
# - branch:  override the default branch (defaults to: main → master → HEAD)
# Keep in sync with src-tauri/src/infrastructure/parser/registry.rs
PARSERS=(
  "rust|tree-sitter/tree-sitter-rust"
  "css|tree-sitter/tree-sitter-css"
  "svelte|Himujjal/tree-sitter-svelte"
  "javascript|tree-sitter/tree-sitter-javascript"
  "typescript|tree-sitter/tree-sitter-typescript"
  # tree-sitter-markdown uses branch "split_parser" (not main/master)
  "markdown|tree-sitter-grammars/tree-sitter-markdown|tree-sitter-markdown|split_parser"
  "markdown_inline|tree-sitter-grammars/tree-sitter-markdown|tree-sitter-markdown-inline|split_parser"
  "toml|ikatyang/tree-sitter-toml"
  "json|tree-sitter/tree-sitter-json"
  "html|tree-sitter/tree-sitter-html"
)

compile_parser() {
  local NAME=$1
  local REPO=$2
  local SUBDIR=${3:-}
  local BRANCH_OVERRIDE=${4:-}
  local DEST="$OUT_DIR/${NAME}-${PLATFORM}.${EXT}"

  if [ -f "$DEST" ]; then
    echo "⏭  $NAME already built, skipping"
    return 0
  fi

  echo "🔨 Compiling $NAME from $REPO ..."

  local TMP
  TMP=$(mktemp -d)
  trap "rm -rf $TMP" RETURN

  # Download source ZIP — try explicit branch override first, then main/master
  # Use the simpler /${BRANCH}.zip format (no refs/heads/) — more reliable with redirects
  local ZIP="$TMP/source.zip"
  local DOWNLOADED=false
  local BRANCHES_TO_TRY=()
  [ -n "$BRANCH_OVERRIDE" ] && BRANCHES_TO_TRY+=("$BRANCH_OVERRIDE")
  BRANCHES_TO_TRY+=(main master)
  for BRANCH in "${BRANCHES_TO_TRY[@]}"; do
    local URL="https://github.com/${REPO}/archive/${BRANCH}.zip"
    if curl -fsSL --retry 3 -o "$ZIP" "$URL" 2>/dev/null; then
      DOWNLOADED=true
      break
    fi
  done
  # Final fallback: default branch via HEAD redirect
  if [ "$DOWNLOADED" = false ]; then
    if curl -fsSL --retry 3 -o "$ZIP" "https://github.com/${REPO}/archive/HEAD.zip" 2>/dev/null; then
      DOWNLOADED=true
    fi
  fi

  if [ "$DOWNLOADED" = false ]; then
    echo "❌ Could not download $REPO (tried main/master)" >&2
    return 1
  fi

  # Extract
  local SRC="$TMP/src"
  mkdir -p "$SRC"
  unzip -q "$ZIP" -d "$SRC"

  # Find the top-level project directory
  local PROJECT
  PROJECT=$(find "$SRC" -maxdepth 1 -mindepth 1 -type d | head -1)

  # Locate src/parser.c, respecting subdir if specified
  local SRC_DIR=""
  if [ -n "$SUBDIR" ] && [ -f "$PROJECT/$SUBDIR/src/parser.c" ]; then
    SRC_DIR="$PROJECT/$SUBDIR/src"
  elif [ -f "$PROJECT/src/parser.c" ]; then
    SRC_DIR="$PROJECT/src"
  elif [ -f "$PROJECT/$NAME/src/parser.c" ]; then
    SRC_DIR="$PROJECT/$NAME/src"
  elif [ -f "$PROJECT/tree-sitter-${NAME}/src/parser.c" ]; then
    SRC_DIR="$PROJECT/tree-sitter-${NAME}/src"
  else
    # Scan one level of subdirs
    for D in "$PROJECT"/*/; do
      if [ -f "${D}src/parser.c" ]; then
        SRC_DIR="${D}src"
        break
      fi
    done
  fi

  if [ -z "$SRC_DIR" ]; then
    echo "❌ src/parser.c not found for $NAME" >&2
    return 1
  fi

  # Build shared library flags (platform-specific)
  # Use -O1 instead of -O2 for very large parser.c files to avoid OOM in CI
  local PARSER_SIZE
  PARSER_SIZE=$(wc -c < "$SRC_DIR/parser.c" 2>/dev/null || echo 0)
  local OPT_LEVEL="-O2"
  [ "$PARSER_SIZE" -gt 1000000 ] && OPT_LEVEL="-O1"

  # -fPIC is required on Linux/macOS but unsupported on Windows (MSVC target)
  local PIC_FLAG="-fPIC"
  [[ "$PLATFORM" == windows* ]] && PIC_FLAG=""

  # For C++ scanner, compile parser.c and scanner.cc separately
  # to avoid mixing -std=c11 and -std=c++14 in one invocation
  if [ -f "$SRC_DIR/scanner.cc" ]; then
    local OBJ_PARSER="$TMP/parser.o"
    local OBJ_SCANNER="$TMP/scanner.o"
    local CC_C
    CC_C=$(detect_compiler "false")
    local CC_CPP
    CC_CPP=$(detect_compiler "true")
    if ! "$CC_C" -c $PIC_FLAG "$OPT_LEVEL" -std=c11 -I"$SRC_DIR" "$SRC_DIR/parser.c" -o "$OBJ_PARSER"; then
      echo "❌ Compilation failed for $NAME (parser.c)" >&2; return 1
    fi
    if ! "$CC_CPP" -c $PIC_FLAG "$OPT_LEVEL" -std=c++14 -I"$SRC_DIR" "$SRC_DIR/scanner.cc" -o "$OBJ_SCANNER"; then
      echo "❌ Compilation failed for $NAME (scanner.cc)" >&2; return 1
    fi
    local EXTRA_OBJS=()
    [ -f "$SRC_DIR/scanner.c" ] && {
      local OBJ_SCANNER_C="$TMP/scanner_c.o"
      "$CC_C" -c $PIC_FLAG "$OPT_LEVEL" -std=c11 -I"$SRC_DIR" "$SRC_DIR/scanner.c" -o "$OBJ_SCANNER_C"
      EXTRA_OBJS+=("$OBJ_SCANNER_C")
    }
    "$CC_CPP" -shared "$OBJ_PARSER" "$OBJ_SCANNER" "${EXTRA_OBJS[@]}" -o "$DEST"
  else
    local CC_C2
    CC_C2=$(detect_compiler "false")
    local FLAGS=("-shared" $PIC_FLAG "$OPT_LEVEL" "-std=c11" "-I$SRC_DIR" "$SRC_DIR/parser.c")
    [ -f "$SRC_DIR/scanner.c" ] && FLAGS+=("$SRC_DIR/scanner.c")
    FLAGS+=("-o" "$DEST")
    "$CC_C2" "${FLAGS[@]}" || { echo "❌ Compilation failed for $NAME" >&2; return 1; }
  fi

  echo "✅ $NAME → $DEST"
}

# ── Main loop ────────────────────────────────────────────────────────────────
SUCCESS=0
FAILED=()

for ENTRY in "${PARSERS[@]}"; do
  IFS='|' read -r NAME REPO SUBDIR BRANCH <<< "${ENTRY}|||"
  if compile_parser "$NAME" "$REPO" "$SUBDIR" "$BRANCH"; then
    (( SUCCESS++ )) || true
  else
    FAILED+=("$NAME")
  fi
done

echo ""
echo "────────────────────────────────────────"
echo "✅ Built:  $SUCCESS"
if [ ${#FAILED[@]} -gt 0 ]; then
  echo "❌ Failed: ${FAILED[*]}"
  exit 1
fi
echo "────────────────────────────────────────"
