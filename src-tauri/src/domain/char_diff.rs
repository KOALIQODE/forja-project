//! Character/word-level diff — Myers O(N·D) algorithm.
//!
//! Used by the diff commands to produce fine-grained span annotations for
//! hunk-preview popups. Token strategy: words split on whitespace + punctuation
//! boundaries, giving more readable diffs than raw byte comparison.
//!
//! This module has no I/O and no Tauri dependencies — pure domain logic.

use serde::Serialize;

// ── Public types ──────────────────────────────────────────────────────────────

/// A single diff span produced by [`myers_word_diff`].
#[derive(Serialize, Clone, Debug)]
pub struct CharSpan {
    /// `"equal"` | `"insert"` | `"delete"`
    pub span_type: String,
    pub text: String,
}

// ── Tokeniser ─────────────────────────────────────────────────────────────────

/// Splits a string into tokens on whitespace and punctuation boundaries.
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

/// Computes a word-level Myers diff between `old` and `new`.
/// Returns a list of spans with type `"equal"` | `"insert"` | `"delete"`.
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
                v[ki + 1] as usize
            } else {
                v[ki - 1] as usize + 1
            };
            let mut y = (x as isize - k) as usize;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn diff_equal_strings() {
        let spans = myers_word_diff("hello world", "hello world");
        assert!(spans.iter().all(|s| s.span_type == "equal"));
        let text: String = spans.iter().map(|s| s.text.as_str()).collect();
        assert_eq!(text, "hello world");
    }

    #[test]
    fn diff_pure_insert() {
        let spans = myers_word_diff("", "hello");
        assert_eq!(spans.len(), 1);
        assert_eq!(spans[0].span_type, "insert");
        assert_eq!(spans[0].text, "hello");
    }

    #[test]
    fn diff_pure_delete() {
        let spans = myers_word_diff("hello", "");
        assert_eq!(spans.len(), 1);
        assert_eq!(spans[0].span_type, "delete");
        assert_eq!(spans[0].text, "hello");
    }

    #[test]
    fn diff_word_substitution() {
        let spans = myers_word_diff("foo bar", "foo baz");
        let has_delete = spans.iter().any(|s| s.span_type == "delete" && s.text == "bar");
        let has_insert = spans.iter().any(|s| s.span_type == "insert" && s.text == "baz");
        assert!(has_delete, "Expected 'bar' to be deleted");
        assert!(has_insert, "Expected 'baz' to be inserted");
    }
}
