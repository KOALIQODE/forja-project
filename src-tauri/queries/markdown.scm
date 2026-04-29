; Headings
(atx_heading
  (atx_h1_marker) @keyword
  (inline) @markup.heading.1)
(atx_heading
  (atx_h2_marker) @keyword
  (inline) @markup.heading.2)
(atx_heading
  (atx_h3_marker) @keyword
  (inline) @markup.heading.3)
(atx_heading
  (atx_h4_marker) @keyword
  (inline) @markup.heading.4)
(atx_heading
  (atx_h5_marker) @keyword
  (inline) @markup.heading.5)
(atx_heading
  (atx_h6_marker) @keyword
  (inline) @markup.heading.6)
(setext_heading) @markup.heading.1

; Code
(fenced_code_block) @markup.raw.block
(code_span) @markup.raw.inline
(indented_code_block) @markup.raw.block

; Inline formatting
(emphasis) @markup.italic
(strong_emphasis) @markup.bold
(strikethrough) @markup.strikethrough

; Links
(link_destination) @string
(link_label) @markup.link
(link_text) @markup.link
(image) @markup.link
(uri_autolink) @string

; Blockquote
(block_quote) @markup.quote
(block_quote_marker) @punctuation.special

; Lists
(list_marker_dot) @punctuation.special
(list_marker_parenthesis) @punctuation.special
(list_marker_minus) @punctuation.special
(list_marker_plus) @punctuation.special
(list_marker_star) @punctuation.special
(list_marker_task) @punctuation.special

; HTML in markdown
(html_block) @markup.raw.block
(inline_html) @tag

; Thematic break
(thematic_break) @punctuation.special
