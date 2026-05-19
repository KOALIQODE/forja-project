// Shared constants for explorer item components
export const GIT_STATUS_COLORS: Record<string, string> = {
  modified: 'text-orange-400',
  added: 'text-green-400',
  untracked: 'text-zinc-400',
  renamed: 'text-blue-400-git',
  deleted: 'text-red-400',
};

export const GIT_STATUS_LABELS: Record<string, string> = {
  modified: 'M',
  added: 'A',
  untracked: 'U',
  renamed: 'R',
  deleted: 'D',
};

export function getBreadcrumbIcon(kind: string): string {
  switch (kind) {
    case 'function_item':
    case 'function_declaration':
    case 'function_expression':
    case 'generator_function_declaration':
    case 'generator_function':
    case 'method_definition':
    case 'arrow_function':
      return 'ƒ';
    case 'impl_item':
      return '⧬';
    case 'module':
      return '📦';
    case 'class_declaration':
    case 'class_expression':
    case 'abstract_class_declaration':
      return '🏛';
    case 'struct_item':
      return 'S';
    case 'enum_item':
    case 'enum_declaration':
      return 'E';
    case 'pair':
    case 'method_signature':
    case 'property_signature':
      return '{}';
    case 'type_alias_declaration':
      return 'T';
    case 'trait_item':
      return '◈';
    default:
      return '•';
  }
}
