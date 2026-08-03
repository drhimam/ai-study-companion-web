import { useMemo } from 'react';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cleanLatex(text: string): string {
  return text
    .replace(/\\\[(.*?)\\\]/gs, (_, m) => `\n${m.trim()}\n`)
    .replace(/\\\((.*?)\\\)/gs, (_, m) => m.trim())
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1)/($2)')
    .replace(/\\sqrt\{([^}]+)\}/g, '√($1)')
    .replace(/\\sum_\{([^}]+)\}/g, 'Σ_{$1}')
    .replace(/\\sum/g, 'Σ')
    .replace(/\\cdot/g, '·')
    .replace(/\\times/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\pm/g, '±')
    .replace(/\\approx/g, '≈')
    .replace(/\\neq/g, '≠')
    .replace(/\\leq/g, '≤')
    .replace(/\\geq/g, '≥')
    .replace(/\\infty/g, '∞')
    .replace(/\\alpha/g, 'α')
    .replace(/\\beta/g, 'β')
    .replace(/\\gamma/g, 'γ')
    .replace(/\\delta/g, 'δ')
    .replace(/\\theta/g, 'θ')
    .replace(/\\mu/g, 'μ')
    .replace(/\\sigma/g, 'σ')
    .replace(/\\pi/g, 'π')
    .replace(/\\lambda/g, 'λ')
    .replace(/\\Rightarrow/g, '⇒')
    .replace(/\\rightarrow/g, '→')
    .replace(/\\rightarrow/g, '→')
    .replace(/\\^(\w)/g, '^$1')
    .replace(/\\_(\w)/g, '_$1');
}

/**
 * Answers come from the AI, whose context includes pasted pages and
 * transcripts, so a link target is untrusted. Allow only ordinary web schemes;
 * anything else (javascript:, data:, vbscript:) is rendered as plain text.
 */
function isSafeHref(href: string): boolean {
  // Entities are already escaped upstream; decode the ones that can hide a scheme.
  const cleaned = href.trim().replace(/&#(\d+);?/g, (_m, code: string) => String.fromCharCode(Number(code)));
  const collapsed = cleaned.replace(/[\s\u0000-\u001f]/g, '').toLowerCase();
  if (/^(javascript|data|vbscript|file|blob):/.test(collapsed)) return false;
  // Relative links and anchors are fine; otherwise require an allowed scheme.
  if (!/^[a-z][a-z0-9+.-]*:/.test(collapsed)) return true;
  return /^(https?|mailto):/.test(collapsed);
}

function renderInline(text: string): string {
  let t = escapeHtml(text);
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, href: string) =>
    isSafeHref(href) ? `<a href="${href}" target="_blank" rel="noreferrer">${label}</a>` : label,
  );
  return t;
}

export function renderMarkdown(src: string): string {
  const cleaned = cleanLatex(src);
  const lines = cleaned.split('\n');
  const out: string[] = [];
  let i = 0;
  let listType: 'ul' | 'ol' | null = null;

  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // code block
    if (line.trim().startsWith('```')) {
      closeList();
      const lang = line.trim().slice(3).trim();
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        code.push(lines[i]);
        i++;
      }
      i++;
      const codeText = escapeHtml(code.join('\n'));
      out.push(
        `<div class="md-code"><div class="md-code-head"><span>${escapeHtml(lang || 'code')}</span></div><pre><code>${codeText}</code></pre></div>`,
      );
      continue;
    }

    // horizontal rule
    if (/^---+\s*$/.test(line)) {
      closeList();
      out.push('<hr class="md-hr" />');
      i++;
      continue;
    }

    // table
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
      closeList();
      const header = line.split('|').map((c) => c.trim()).filter((c) => c.length > 0);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|')) {
        rows.push(lines[i].split('|').map((c) => c.trim()).filter((c) => c.length > 0));
        i++;
      }
      out.push('<div class="md-table-wrap"><table class="md-table"><thead><tr>');
      out.push(header.map((h) => `<th>${renderInline(h)}</th>`).join(''));
      out.push('</tr></thead><tbody>');
      for (const row of rows) {
        out.push('<tr>');
        out.push(row.map((c) => `<td>${renderInline(c)}</td>`).join(''));
        out.push('</tr>');
      }
      out.push('</tbody></table></div>');
      continue;
    }

    // headings
    const hMatch = line.match(/^(#{1,4})\s+(.*)$/);
    if (hMatch) {
      closeList();
      const level = hMatch[1].length;
      out.push(`<h${level} class="md-h md-h${level}">${renderInline(hMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    // blockquote
    if (line.trim().startsWith('>')) {
      closeList();
      out.push(`<blockquote class="md-quote">${renderInline(line.replace(/^\s*>\s?/, ''))}</blockquote>`);
      i++;
      continue;
    }

    // unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      if (listType !== 'ul') {
        closeList();
        out.push('<ul class="md-ul">');
        listType = 'ul';
      }
      out.push(`<li>${renderInline(line.replace(/^\s*[-*]\s+/, ''))}</li>`);
      i++;
      continue;
    }

    // ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      if (listType !== 'ol') {
        closeList();
        out.push('<ol class="md-ol">');
        listType = 'ol';
      }
      out.push(`<li>${renderInline(line.replace(/^\s*\d+\.\s+/, ''))}</li>`);
      i++;
      continue;
    }

    // blank line
    if (line.trim() === '') {
      closeList();
      i++;
      continue;
    }

    // paragraph
    closeList();
    out.push(`<p class="md-p">${renderInline(line)}</p>`);
    i++;
  }

  closeList();
  return out.join('\n');
}

export function Markdown({ content }: { content: string }) {
  const html = useMemo(() => renderMarkdown(content), [content]);
  return <div className="md-body" dangerouslySetInnerHTML={{ __html: html }} />;
}
