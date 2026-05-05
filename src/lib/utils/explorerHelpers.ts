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
