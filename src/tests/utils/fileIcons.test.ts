import { describe, it, expect } from 'vitest';
import { getFileIcon, LANGUAGE_ICONS, ICON_COLORS } from '$lib/utils/fileIcons';

describe('getFileIcon', () => {
  describe('special file names', () => {
    it('Dockerfile', () => {
      const icon = getFileIcon('Dockerfile');
      expect(icon).toBeDefined();
      expect(icon.label).toContain('Docker');
    });

    it('dockerfile (lowercase)', () => {
      const icon = getFileIcon('dockerfile');
      expect(icon.label).toContain('Docker');
    });

    it('.gitignore', () => {
      const icon = getFileIcon('.gitignore');
      expect(icon.label).toContain('Git');
    });

    it('.gitattributes', () => {
      const icon = getFileIcon('.gitattributes');
      expect(icon.label).toContain('Git');
    });

    it('package.json', () => {
      const icon = getFileIcon('package.json');
      expect(icon.label).toContain('Package');
    });

    it('package-lock.json', () => {
      const icon = getFileIcon('package-lock.json');
      expect(icon.label).toContain('Package');
    });

    it('tsconfig.json', () => {
      const icon = getFileIcon('tsconfig.json');
      expect(icon.label).toContain('Config');
    });

    it('vite.config.ts', () => {
      const icon = getFileIcon('vite.config.ts');
      expect(icon.label).toContain('Config');
    });

    it('.env', () => {
      const icon = getFileIcon('.env');
      expect(icon.label).toContain('Environment');
    });

    it('.env.production', () => {
      const icon = getFileIcon('.env.production');
      expect(icon.label).toContain('Environment');
    });

    it('Makefile', () => {
      const icon = getFileIcon('Makefile');
      expect(icon.label).toContain('Makefile');
    });

    it('README.md', () => {
      const icon = getFileIcon('README.md');
      expect(icon.label).toContain('README');
    });

    it('LICENSE', () => {
      const icon = getFileIcon('LICENSE');
      expect(icon.label).toContain('License');
    });

    it('Cargo.toml', () => {
      const icon = getFileIcon('Cargo.toml');
      expect(icon.label).toContain('Cargo');
    });

    it('Cargo.lock', () => {
      const icon = getFileIcon('Cargo.lock');
      expect(icon.label).toContain('Cargo');
    });

    it('go.mod', () => {
      const icon = getFileIcon('go.mod');
      expect(icon.label).toContain('Go');
    });
  });

  describe('.lock files', () => {
    it('yarn.lock falls back to lock icon', () => {
      const icon = getFileIcon('yarn.lock');
      expect(icon).toBeDefined();
      expect(icon.label).toContain('Lock');
    });

    it('package-lock.json uses package icon (special case wins)', () => {
      const icon = getFileIcon('package-lock.json');
      expect(icon.label).toContain('Package');
    });
  });

  describe('extension-based icons', () => {
    const cases: [string, string][] = [
      ['main.rs', 'Rust'],
      ['app.ts', 'TypeScript'],
      ['app.tsx', 'TSX'],
      ['index.js', 'JavaScript'],
      ['component.jsx', 'JSX'],
      ['App.svelte', 'Svelte'],
      ['main.py', 'Python'],
      ['main.go', 'Go'],
      ['Main.java', 'Java'],
      ['main.c', 'C'],
      ['main.cpp', 'C++'],
      ['style.css', 'CSS'],
      ['index.html', 'HTML'],
      ['data.json', 'JSON'],
      ['config.yaml', 'YAML'],
      ['config.toml', 'TOML'],
      ['notes.md', 'Markdown'],
      ['query.sql', 'SQL'],
      ['schema.graphql', 'GraphQL'],
      ['image.png', 'PNG Image'],
      ['photo.jpg', 'JPG Image'],
      ['icon.svg', 'SVG Image'],
      ['archive.zip', 'ZIP Archive'],
      ['script.sh', 'Shell'],
    ];

    for (const [filename, expectedLabel] of cases) {
      it(`${filename} → ${expectedLabel}`, () => {
        const icon = getFileIcon(filename);
        expect(icon.label).toBe(expectedLabel);
      });
    }
  });

  describe('unknown files', () => {
    it('returns default icon for unrecognized extension', () => {
      const icon = getFileIcon('mystery.xyz123');
      expect(icon).toBe(LANGUAGE_ICONS.default);
    });

    it('returns default icon for file with no extension', () => {
      const icon = getFileIcon('somefile');
      expect(icon).toBe(LANGUAGE_ICONS.default);
    });
  });

  describe('path separators', () => {
    it('handles unix-style path', () => {
      const icon = getFileIcon('/home/user/project/main.rs');
      expect(icon.label).toBe('Rust');
    });

    it('handles windows-style path', () => {
      const icon = getFileIcon('C:\\Users\\project\\main.ts');
      expect(icon.label).toBe('TypeScript');
    });
  });

  describe('ICON_COLORS', () => {
    it('all values are hex color strings', () => {
      for (const [, color] of Object.entries(ICON_COLORS)) {
        expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    });
  });
});
