import {
  FileCode,
  FileJson,
  FileText,
  FileImage,
  FileArchive,
  File,
  Package,
  GitBranch,
  Cpu,
  Database,
  Palette,
  FileCog,
  FileQuestion,
  Bookmark,
  Coffee,
  Braces,
} from '@lucide/svelte';

export interface FileIconConfig {
  icon: any;
  color: string;
  label: string;
}

// Muted colors for a cleaner professional look
const COLORS = {
  rust: '#a54a3d',
  js: '#c9b730',
  ts: '#4a76a8',
  py: '#4a76a8',
  html: '#a54a3d',
  css: '#7a5a9c',
  json: '#c9b730',
  md: '#607d8b',
  git: '#a54a3d',
  docker: '#4a76a8',
  config: '#757575',
  default: '#858585'
};

export const LANGUAGE_ICONS: Record<string, FileIconConfig> = {
  rs: { icon: FileCode, color: COLORS.rust, label: 'Rust' },
  js: { icon: Coffee, color: COLORS.js, label: 'JavaScript' },
  jsx: { icon: Coffee, color: COLORS.js, label: 'JSX' },
  ts: { icon: FileCode, color: COLORS.ts, label: 'TypeScript' },
  tsx: { icon: FileCode, color: COLORS.ts, label: 'TSX' },
  py: { icon: FileCode, color: COLORS.py, label: 'Python' },
  json: { icon: FileJson, color: COLORS.json, label: 'JSON' },
  md: { icon: FileText, color: COLORS.md, label: 'Markdown' },
  html: { icon: FileCode, color: COLORS.html, label: 'HTML' },
  css: { icon: Palette, color: COLORS.css, label: 'CSS' },
  scss: { icon: Palette, color: COLORS.css, label: 'SCSS' },
  toml: { icon: FileText, color: COLORS.config, label: 'TOML' },
  yaml: { icon: FileText, color: COLORS.config, label: 'YAML' },
  yml: { icon: FileText, color: COLORS.config, label: 'YAML' },
  lock: { icon: Package, color: COLORS.config, label: 'Lock File' },
  gitignore: { icon: GitBranch, color: COLORS.git, label: 'Git' },
  dockerfile: { icon: Package, color: COLORS.docker, label: 'Docker' },
  png: { icon: FileImage, color: COLORS.default, label: 'Image' },
  jpg: { icon: FileImage, color: COLORS.default, label: 'Image' },
  zip: { icon: FileArchive, color: COLORS.default, label: 'Archive' },
  pdf: { icon: FileText, color: COLORS.default, label: 'PDF' },
  default: { icon: File, color: COLORS.default, label: 'File' },
};

export function getFileIcon(filename: string): FileIconConfig {
  const parts = filename.toLowerCase().split('.');
  if (parts.length < 2) {
    if (filename === 'Dockerfile') return LANGUAGE_ICONS['dockerfile'];
    return LANGUAGE_ICONS['default'];
  }

  const ext = parts[parts.length - 1];

  if (filename === 'Dockerfile') return LANGUAGE_ICONS['dockerfile'];
  if (filename.endsWith('.lock')) return LANGUAGE_ICONS['lock'];
  if (filename === '.gitignore') return LANGUAGE_ICONS['gitignore'];

  return LANGUAGE_ICONS[ext] || LANGUAGE_ICONS['default'];
}
