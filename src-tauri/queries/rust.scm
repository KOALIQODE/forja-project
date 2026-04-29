; Keywords
[
  "as" "async" "await" "break" "const" "continue" "crate" "dyn"
  "else" "enum" "extern" "fn" "for" "if" "impl" "in" "let" "loop"
  "match" "mod" "move" "mut" "pub" "ref" "return" "self" "Self"
  "static" "struct" "super" "trait" "type" "union" "unsafe" "use"
  "where" "while" "yield"
] @keyword

; Types
(type_identifier) @type
(primitive_type) @type.builtin
(self) @variable.builtin

; Functions
(function_item name: (identifier) @function)
(call_expression function: (identifier) @function.call)
(call_expression function: (field_expression field: (field_identifier) @function.method))
(macro_invocation macro: (identifier) @function.macro)

; Literals
(string_literal) @string
(char_literal) @string
(integer_literal) @number
(float_literal) @number
(boolean_literal) @constant.builtin

; Comments
(line_comment) @comment
(block_comment) @comment

; Attributes
(attribute_item) @attribute
(inner_attribute_item) @attribute

; Lifetimes
(lifetime (identifier) @label)

; Variables / parameters
(identifier) @variable
(field_identifier) @property

; Operators
["+" "-" "*" "/" "%" "==" "!=" "<" "<=" ">" ">=" "&&" "||" "!" "&" "|" "^" "<<" ">>" "=" "+=" "-=" "*=" "/=" "%=" "&=" "|=" "^=" "<<=" ">>=" "..=" ".."] @operator

; Punctuation
["(" ")" "[" "]" "{" "}"] @punctuation.bracket
["," "." ";" ":" "::" "->"] @punctuation.delimiter
