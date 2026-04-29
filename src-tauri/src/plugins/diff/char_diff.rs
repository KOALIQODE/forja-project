// diff/char_diff.rs — Phase 6
//
// Myers O(N·D) character/word-level diff.
// Used by compute_char_diff to produce fine-grained spans for hover previews.
//
// Token strategy: words are split on whitespace + punctuation boundaries,
// which gives more readable diffs than raw byte-level comparison.

use serde::Serialize;

// ── Public types ──────────────────────────────────────────────────────────────

#[derive(Serialize, Clone, Debug)]
pub struct CharSpan {
    /// "equal" | "insert" | "delete"
    pub span_type: String,
    pub text: String,
}

// ── Tokeniser ─────────────────────────────────────────────────────────────────

/// Splits a string into tokens on whitespace and punctuation boundaries.
/// Returns (token_text, byte_offset) pairs.
fn tokenise(s: &str) -> Vec<&str> {
    let mut tokens = Vec::new();
    let mut start = 0;
    let mut in_word = false;

    for (i, ch) in s.char_indices() {
        let is_alnum = ch.is_alphanumeric() || ch == '_';
        if is_alnum != in_word {
            if start < i {
                tokens.push(&s[start..i]);
            }
            start   = i;
            in_word = is_alnum;
        }
    }
    if start < s.len() {
        tokens.push(&s[start..]);
    }
    tokens
}

// ── Myers core (on &str slices) ───────────────────────────────────────────────

pub fn myers_word_diff(old: &str, new: &str) -> Vec<CharSpan> {
    let a: Vec<&str> = tokenise(old);
    let b: Vec<&str> = tokenise(new);

    let ops = myers_diff_tokens(&a, &b);
    ops_to_spans(&ops, &a, &b)
}

#[derive(Debug, Clone, Copy)]
enum OpType { Equal, Insert, Delete }

#[derive(Debug)]
struct DiffOp {
    op:        OpType,
    old_start: usize,
    old_end:   usize,
    new_start: usize,
    new_end:   usize,
}

fn myers_diff_tokens(a: &[&str], b: &[&str]) -> Vec<DiffOp> {
    let n = a.len();
    let m = b.len();

    if n == 0 && m == 0 { return vec![]; }
    if n == 0 {
        return vec![DiffOp { op: OpType::Insert, old_start: 0, old_end: 0, new_start: 0, new_end: m }];
    }
    if m == 0 {
        return vec![DiffOp { op: OpType::Delete, old_start: 0, old_end: n, new_start: 0, new_end: 0 }];
    }

    let max    = n + m;
    let offset = max as isize;
    let vsize  = 2 * max + 2;

    // v[k + offset] = furthest x on diagonal k
    let mut v: Vec<isize> = vec![-1; vsize];
    v[(1 + offset) as usize] = 0;

    let mut trace: Vec<Vec<isize>> = Vec::with_capacity(max + 1);
    let mut end_d = 0usize;
    let mut found = false;

    'outer: for d in 0..=max {
        trace.push(v.clone());
        let d_isize = d as isize;
        let mut k = -d_isize;
        while k <= d_isize {
            let ki = (k + offset) as usize;
            let x: usize = if k == -d_isize || (k != d_isize && v[ki - 1] < v[ki + 1]) {
                v[ki + 1] as usize          // insert: move down, x stays
            } else {
                v[ki - 1] as usize + 1      // delete: move right, x+1
            };
            let mut y = (x as isize - k) as usize;
            // snake
            let mut xx = x;
            while xx < n && y < m && a[xx] == b[y] { xx += 1; y += 1; }
            v[ki] = xx as isize;
            if xx >= n && y >= m {
                end_d = d;
                found = true;
                break 'outer;
            }
            k += 2;
        }
    }
    if !found { end_d = max; }

    // Backtrack
    let mut ops: Vec<DiffOp> = Vec::new();
    let mut x = n as isize;
    let mut y = m as isize;

    for d in (1..=end_d).rev() {
        let v_prev = &trace[d];
        let k  = x - y;
        let ki = (k + offset) as usize;
        let d_isize = d as isize;

        let prev_k: isize = if k == -d_isize || (k != d_isize && v_prev[ki - 1] < v_prev[ki + 1]) {
            k + 1
        } else {
            k - 1
        };

        let prev_x = v_prev[(prev_k + offset) as usize];
        let prev_y = prev_x - prev_k;

        if prev_k == k + 1 {
            // Insert
            let mid_x = prev_x;
            let mid_y = prev_y + 1;
            if x > mid_x {
                ops.push(DiffOp {
                    op: OpType::Equal,
                    old_start: mid_x as usize, old_end: x as usize,
                    new_start: mid_y as usize, new_end: y as usize,
                });
            }
            ops.push(DiffOp {
                op: OpType::Insert,
                old_start: prev_x as usize, old_end: prev_x as usize,
                new_start: prev_y as usize, new_end: mid_y as usize,
            });
        } else {
            // Delete
            let mid_x = prev_x + 1;
            let mid_y = prev_y;
            if y > mid_y {
                ops.push(DiffOp {
                    op: OpType::Equal,
                    old_start: mid_x as usize, old_end: x as usize,
                    new_start: mid_y as usize, new_end: y as usize,
                });
            }
            ops.push(DiffOp {
                op: OpType::Delete,
                old_start: prev_x as usize, old_end: mid_x as usize,
                new_start: prev_y as usize, new_end: prev_y as usize,
            });
        }

        x = prev_x;
        y = prev_y;
    }

    if x > 0 || y > 0 {
        ops.push(DiffOp {
            op: OpType::Equal,
            old_start: 0, old_end: x as usize,
            new_start: 0, new_end: y as usize,
        });
    }

    ops.reverse();
    ops
}

fn ops_to_spans(ops: &[DiffOp], a: &[&str], b: &[&str]) -> Vec<CharSpan> {
    ops.iter().filter_map(|op| {
        let text = match op.op {
            OpType::Equal  => a[op.old_start..op.old_end].concat(),
            OpType::Delete => a[op.old_start..op.old_end].concat(),
            OpType::Insert => b[op.new_start..op.new_end].concat(),
        };
        if text.is_empty() { return None; }
        Some(CharSpan {
            span_type: match op.op {
                OpType::Equal  => "equal".into(),
                OpType::Insert => "insert".into(),
                OpType::Delete => "delete".into(),
            },
            text,
        })
    }).collect()
}
