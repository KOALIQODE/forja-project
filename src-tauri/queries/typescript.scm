; Keywords (TypeScript + JavaScript)
[
  "abstract" "as" "async" "await" "break" "case" "catch" "class" "const"
  "continue" "debugger" "declare" "default" "delete" "do" "else" "enum"
  "export" "extends" "finally" "for" "from" "function" "get" "if" "implements"
  "import" "in" "instanceof" "interface" "let" "namespace" "new" "of"
  "override" "readonly" "return" "set" "static" "switch" "target" "throw"
  "try" "type" "typeof" "var" "void" "while" "with" "yield"
] @keyword

; Types
(type_identifier) @type
(predefined_type) @type.builtin
(type_annotation (type_identifier) @type)

; Functions
(function_declaration name: (identifier) @function)
(function name: (identifier) @function)
(method_definition name: (property_identifier) @function.method)
(method_signature name: (property_identifier) @function.method)
(call_expression function: (identifier) @function.call)
(call_expression function: (member_expression property: (property_identifier) @function.method))
(arrow_function) @function

; Variables
(identifier) @variable
(property_identifier) @property
(shorthand_property_identifier) @variable

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
["+" "-" "*" "/" "%" "**" "==" "!=" "===" "!==" "<" "<=" ">" ">=" "&&" "||" "!" "&" "|" "^" "~" "<<" ">>" ">>>" "=" "+=" "-=" "??" "?." "..."] @operator

; Punctuation
["(" ")" "[" "]" "{" "}"] @punctuation.bracket
["," "." ";" ":" "::"] @punctuation.delimiter
