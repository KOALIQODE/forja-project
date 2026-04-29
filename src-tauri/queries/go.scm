; Keywords
[
  "break" "case" "chan" "const" "continue" "default" "defer" "else"
  "fallthrough" "for" "func" "go" "goto" "if" "import" "interface"
  "map" "package" "range" "return" "select" "struct" "switch" "type" "var"
] @keyword

; Types
(type_identifier) @type
(predeclared_identifier) @type.builtin

; Functions
(function_declaration name: (identifier) @function)
(method_declaration name: (field_identifier) @function.method)
(call_expression function: (identifier) @function.call)
(call_expression function: (selector_expression field: (field_identifier) @function.method))

; Variables
(identifier) @variable
(field_identifier) @property
(label_name) @label

; Literals
(interpreted_string_literal) @string
(raw_string_literal) @string
(rune_literal) @string
(int_literal) @number
(float_literal) @number
(imaginary_literal) @number
(true) @boolean
(false) @boolean
(nil) @constant.builtin

; Comments
(comment) @comment

; Operators
["+" "-" "*" "/" "%" "&" "|" "^" "~" "<<" ">>" "&^" "==" "!=" "<" "<=" ">" ">=" "&&" "||" "!" "<-" "++" "--" "=" ":=" "+=" "-=" "*=" "/=" "%=" "&=" "|=" "^=" "<<=" ">>=" "&^=" "..." "."] @operator

; Punctuation
["(" ")" "[" "]" "{" "}"] @punctuation.bracket
["," "." ";" ":"] @punctuation.delimiter
