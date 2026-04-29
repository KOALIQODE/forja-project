; Keywords
[
  "as" "async" "await" "break" "case" "catch" "class" "const" "continue"
  "debugger" "default" "delete" "do" "else" "export" "extends" "finally"
  "for" "from" "function" "get" "if" "import" "in" "instanceof" "let"
  "new" "of" "return" "set" "static" "switch" "target" "throw" "try"
  "typeof" "var" "void" "while" "with" "yield"
] @keyword

; Types (JSDoc, TypeScript)
(type_identifier) @type
(predefined_type) @type.builtin

; Functions
(function_declaration name: (identifier) @function)
(function name: (identifier) @function)
(method_definition name: (property_identifier) @function.method)
(call_expression function: (identifier) @function.call)
(call_expression function: (member_expression property: (property_identifier) @function.method))
(arrow_function) @function

; Variables
(identifier) @variable
(shorthand_property_identifier) @variable
(property_identifier) @property

; Literals
(string) @string
(template_string) @string
(regex) @string.special
(number) @number
(true) @boolean
(false) @boolean
(null) @constant.builtin
(undefined) @constant.builtin

; Comments
(comment) @comment

; Operators
["+" "-" "*" "/" "%" "**" "==" "!=" "===" "!==" "<" "<=" ">" ">=" "&&" "||" "!" "&" "|" "^" "~" "<<" ">>" ">>>" "=" "+=" "-=" "*=" "/=" "%=" "**=" "&=" "|=" "^=" "<<=" ">>=" ">>>=" "??" "?." "..." "=>"] @operator

; Punctuation
["(" ")" "[" "]" "{" "}"] @punctuation.bracket
["," "." ";" ":"] @punctuation.delimiter
