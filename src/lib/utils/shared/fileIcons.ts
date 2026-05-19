import {
  Box,
  Braces,
  Coffee,
  Cpu,
  Database,
  File,
  FileArchive,
  FileCode,
  FileCog,
  FileImage,
  FileText,
  FileType,
  GitBranch,
  Globe,
  Image,
  Layers,
  Lock,
  Package,
  Palette,
  Settings,
  Terminal,
} from '@lucide/svelte';

const FileJson = File;

export interface FileIconConfig {
  icon: any;
  color: string;
  label: string;
}

export const ICON_COLORS = {
  rust: '#c96b4a',
  js: '#c5a72e',
  ts: '#4a85c8',
  svelte: '#c2622d',
  vue: '#42a47d',
  react: '#5bafc8',
  py: '#5ba85a',
  go: '#5bafc8',
  java: '#c96b4a',
  c: '#5570a8',
  cpp: '#5570a8',
  cs: '#6a5aad',
  php: '#7e6aad',
  rb: '#c9474a',
  sh: '#5a9e7e',
  html: '#c96b4a',
  css: '#7a5aad',
  scss: '#c26090',
  json: '#c5a72e',
  yaml: '#c5a72e',
  toml: '#c5a72e',
  md: '#5a8a9e',
  sql: '#4a85c8',
  graphql: '#c94a9e',
  docker: '#4a85c8',
  git: '#c9474a',
  env: '#7a9e5a',
  config: '#8a8a8a',
  lock: '#7a7a7a',
  image: '#5a9ec8',
  archive: '#9e7a5a',
  default: '#8a8a8a',
} as const;

const icon = (icon: any, color: string, label: string): FileIconConfig => ({ icon, color, label });

export const LANGUAGE_ICONS: Record<string, FileIconConfig> = {
  rust: icon(FileCode, ICON_COLORS.rust, 'Rust'),
  rs: icon(FileCode, ICON_COLORS.rust, 'Rust'),

  js: icon(FileCode, ICON_COLORS.js, 'JavaScript'),
  jsx: icon(Braces, ICON_COLORS.react, 'JSX'),
  mjs: icon(FileCode, ICON_COLORS.js, 'JavaScript Module'),
  cjs: icon(FileCode, ICON_COLORS.js, 'CommonJS'),

  ts: icon(FileCode, ICON_COLORS.ts, 'TypeScript'),
  tsx: icon(Braces, ICON_COLORS.react, 'TSX'),

  react: icon(Braces, ICON_COLORS.react, 'React'),
  svelte: icon(Layers, ICON_COLORS.svelte, 'Svelte'),
  vue: icon(Layers, ICON_COLORS.vue, 'Vue'),
  astro: icon(FileType, ICON_COLORS.html, 'Astro'),
  nuxt: icon(Globe, ICON_COLORS.vue, 'Nuxt'),
  next: icon(Globe, ICON_COLORS.react, 'Next.js'),

  py: icon(FileCode, ICON_COLORS.py, 'Python'),
  go: icon(Cpu, ICON_COLORS.go, 'Go'),
  java: icon(Coffee, ICON_COLORS.java, 'Java'),
  kt: icon(Coffee, ICON_COLORS.java, 'Kotlin'),

  c: icon(Cpu, ICON_COLORS.c, 'C'),
  cpp: icon(Cpu, ICON_COLORS.cpp, 'C++'),
  cc: icon(Cpu, ICON_COLORS.cpp, 'C++'),
  h: icon(Cpu, ICON_COLORS.c, 'Header'),
  hpp: icon(Cpu, ICON_COLORS.cpp, 'C++ Header'),
  cs: icon(Box, ICON_COLORS.cs, 'C#'),
  php: icon(Globe, ICON_COLORS.php, 'PHP'),
  rb: icon(FileCode, ICON_COLORS.rb, 'Ruby'),

  sh: icon(Terminal, ICON_COLORS.sh, 'Shell'),
  bash: icon(Terminal, ICON_COLORS.sh, 'Bash'),
  zsh: icon(Terminal, ICON_COLORS.sh, 'Zsh'),
  fish: icon(Terminal, ICON_COLORS.sh, 'Fish'),
  env: icon(Terminal, ICON_COLORS.env, 'Environment'),

  html: icon(Globe, ICON_COLORS.html, 'HTML'),
  htm: icon(Globe, ICON_COLORS.html, 'HTML'),
  css: icon(FileCode, ICON_COLORS.css, 'CSS'),
  scss: icon(Palette, ICON_COLORS.scss, 'SCSS'),
  sass: icon(Palette, ICON_COLORS.scss, 'Sass'),
  less: icon(FileCode, ICON_COLORS.css, 'Less'),

  json: icon(FileJson, ICON_COLORS.json, 'JSON'),
  json5: icon(FileJson, ICON_COLORS.json, 'JSON5'),
  jsonc: icon(FileJson, ICON_COLORS.json, 'JSONC'),
  yaml: icon(Settings, ICON_COLORS.yaml, 'YAML'),
  yml: icon(Settings, ICON_COLORS.yaml, 'YAML'),
  toml: icon(Settings, ICON_COLORS.toml, 'TOML'),
  ini: icon(Settings, ICON_COLORS.config, 'INI'),
  config: icon(FileCog, ICON_COLORS.config, 'Config'),

  sql: icon(Database, ICON_COLORS.sql, 'SQL'),
  prisma: icon(Database, ICON_COLORS.sql, 'Prisma'),
  graphql: icon(Braces, ICON_COLORS.graphql, 'GraphQL'),
  gql: icon(Braces, ICON_COLORS.graphql, 'GraphQL'),

  md: icon(FileText, ICON_COLORS.md, 'Markdown'),
  mdx: icon(FileText, ICON_COLORS.md, 'MDX'),
  txt: icon(FileText, ICON_COLORS.default, 'Text'),
  pdf: icon(FileText, ICON_COLORS.default, 'PDF'),
  xml: icon(FileCode, ICON_COLORS.config, 'XML'),

  docker: icon(Box, ICON_COLORS.docker, 'Docker'),
  dockerfile: icon(Box, ICON_COLORS.docker, 'Dockerfile'),
  containerfile: icon(Box, ICON_COLORS.docker, 'Containerfile'),

  git: icon(GitBranch, ICON_COLORS.git, 'Git'),
  gitignore: icon(GitBranch, ICON_COLORS.git, 'Git Ignore'),
  gitattributes: icon(GitBranch, ICON_COLORS.git, 'Git Attributes'),
  gitmodules: icon(GitBranch, ICON_COLORS.git, 'Git Modules'),

  lock: icon(Lock, ICON_COLORS.lock, 'Lock File'),
  wasm: icon(Cpu, ICON_COLORS.ts, 'WebAssembly'),

  image: icon(FileImage, ICON_COLORS.image, 'Image'),
  png: icon(FileImage, ICON_COLORS.image, 'PNG Image'),
  jpg: icon(FileImage, ICON_COLORS.image, 'JPG Image'),
  jpeg: icon(FileImage, ICON_COLORS.image, 'JPEG Image'),
  gif: icon(FileImage, ICON_COLORS.image, 'GIF Image'),
  svg: icon(Image, ICON_COLORS.image, 'SVG Image'),
  webp: icon(FileImage, ICON_COLORS.image, 'WebP Image'),
  ico: icon(FileImage, ICON_COLORS.image, 'Icon'),
  bmp: icon(FileImage, ICON_COLORS.image, 'Bitmap Image'),

  archive: icon(FileArchive, ICON_COLORS.archive, 'Archive'),
  zip: icon(FileArchive, ICON_COLORS.archive, 'ZIP Archive'),
  tar: icon(FileArchive, ICON_COLORS.archive, 'TAR Archive'),
  gz: icon(FileArchive, ICON_COLORS.archive, 'GZip Archive'),
  rar: icon(FileArchive, ICON_COLORS.archive, 'RAR Archive'),

  package: icon(Package, ICON_COLORS.js, 'Package'),
  default: icon(File, ICON_COLORS.default, 'File'),
};

function getSpecialFileIcon(lowerName: string): FileIconConfig | null {
  if (lowerName === 'dockerfile') return LANGUAGE_ICONS.dockerfile;
  if (lowerName === 'containerfile') return LANGUAGE_ICONS.containerfile;

  if (lowerName === '.gitignore') return LANGUAGE_ICONS.gitignore;
  if (lowerName === '.gitattributes') return LANGUAGE_ICONS.gitattributes;
  if (lowerName === '.gitmodules') return LANGUAGE_ICONS.gitmodules;

  if (lowerName === 'package.json' || lowerName === 'package-lock.json') {
    return icon(Package, ICON_COLORS.js, 'Package');
  }

  if (lowerName === 'tsconfig.json' || lowerName === 'jsconfig.json') {
    return icon(Settings, ICON_COLORS.ts, 'TypeScript Config');
  }

  if (
    lowerName.startsWith('vite.config.') ||
    lowerName.startsWith('svelte.config.') ||
    lowerName.startsWith('astro.config.')
  ) {
    return icon(FileCog, ICON_COLORS.config, 'Config');
  }

  if (lowerName === '.env' || lowerName.startsWith('.env.')) {
    return icon(Terminal, ICON_COLORS.env, 'Environment');
  }

  if (lowerName === 'makefile') {
    return icon(Terminal, ICON_COLORS.config, 'Makefile');
  }

  if (lowerName === 'readme.md') {
    return icon(FileText, ICON_COLORS.md, 'README');
  }

  if (lowerName === 'license' || lowerName === 'license.md') {
    return icon(FileText, ICON_COLORS.config, 'License');
  }

  if (lowerName === 'cargo.toml') {
    return icon(Package, ICON_COLORS.rust, 'Cargo');
  }

  if (lowerName === 'cargo.lock') {
    return icon(Package, ICON_COLORS.rust, 'Cargo Lock');
  }

  if (lowerName === 'go.mod') {
    return icon(Package, ICON_COLORS.go, 'Go Module');
  }

  if (lowerName === 'go.sum') {
    return icon(Package, ICON_COLORS.go, 'Go Checksum');
  }

  return null;
}

export function getFileIcon(filename: string): FileIconConfig {
  const baseName = filename.split(/[\\/]/).pop() ?? filename;
  const lowerName = baseName.toLowerCase();

  const special = getSpecialFileIcon(lowerName);
  if (special) return special;

  if (lowerName.endsWith('.lock')) {
    return LANGUAGE_ICONS.lock;
  }

  const extension = lowerName.includes('.') ? lowerName.split('.').pop() : '';

  if (extension && LANGUAGE_ICONS[extension]) {
    return LANGUAGE_ICONS[extension];
  }

  return LANGUAGE_ICONS.default;
}
