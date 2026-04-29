; Keywords
[
  "and" "as" "assert" "async" "await" "break" "class" "continue" "def"
  "del" "elif" "else" "except" "finally" "for" "from" "global" "if"
  "import" "in" "is" "lambda" "nonlocal" "not" "or" "pass" "raise"
  "return" "try" "while" "with" "yield"
] @keyword

; Builtins
(true) @boolean
(false) @boolean
(none) @constant.builtin

; Functions
(function_definition name: (identifier) @function)
(call function: (identifier) @function.call)
(call function: (attribute attribute: (identifier) @function.method))
(decorator) @attribute

; Types
(class_definition name: (identifier) @type)
(type (identifier) @type)

; Variables
(identifier) @variable
(attribute attribute: (identifier) @property)
(keyword_argument name: (identifier) @variable.parameter)
(parameters (identifier) @variable.parameter)

; Literals
(string) @string
(integer) @number
(float) @number
(complex) @number

; Comments
(comment) @comment

; Operators
["+" "-" "*" "/" "//" "%" "**" "==" "!=" "<" "<=" ">" ">=" "and" "or" "not" "is" "in" "=" "+=" "-=" "*=" "/=" "//=" "%=" "**=" "&=" "|=" "^=" "<<=" ">>=" "@=" "&" "|" "^" "~" "<<" ">>" "->" ":=" "..."] @operator

; Punctuation
["(" ")" "[" "]" "{" "}"] @punctuation.bracket
["," "." ";" ":" "@"] @punctuation.delimiter
