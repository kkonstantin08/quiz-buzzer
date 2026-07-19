import React from 'react';
import type { LegalDocument } from '../../config/legal';

function tableCells(line: string) {
  return line.split('|').slice(1, -1).map(cell => cell.trim());
}

function isTableDivider(line: string) {
  return /^\|[\s|:-]+\|$/.test(line);
}

export function LegalDocumentPage({ document }: { document: LegalDocument }) {
  const lines = document.markdown.trim().split('\n');
  const blocks: React.ReactNode[] = [];

  for (let index = 0; index < lines.length;) {
    const line = lines[index];

    if (!line) {
      index++;
      continue;
    }

    const heading = /^(#{1,2}) (.+)$/.exec(line);
    if (heading) {
      const Tag = heading[1].length === 1 ? 'h1' : 'h2';
      blocks.push(<Tag className={Tag === 'h1' ? 'font-bold' : 'mt-8 border-t border-slate-200 pt-6 text-xl font-bold text-slate-900'} key={index}>{heading[2]}</Tag>);
      index++;
      continue;
    }

    if (line.startsWith('|')) {
      const rows: string[][] = [];
      while (index < lines.length && lines[index].startsWith('|')) {
        if (!isTableDivider(lines[index])) rows.push(tableCells(lines[index]));
        index++;
      }
      const [header, ...body] = rows;
      blocks.push(
        <div className="not-prose overflow-x-auto" key={index}>
          <table className="w-full border-collapse text-left text-sm">
            <thead><tr>{header.map((cell, cellIndex) => <th className="border border-slate-300 bg-slate-50 p-2" key={cellIndex}>{cell}</th>)}</tr></thead>
            <tbody>{body.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td className="border border-slate-300 p-2 align-top" key={cellIndex}>{cell}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (line.startsWith('- ')) {
      const items: string[] = [];
      while (index < lines.length && lines[index].startsWith('- ')) items.push(lines[index++].slice(2));
      blocks.push(<ul key={index}>{items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>);
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && lines[index] && !/^(#{1,2}) /.test(lines[index]) && !lines[index].startsWith('|') && !lines[index].startsWith('- ')) {
      paragraph.push(lines[index++]);
    }
    blocks.push(<p key={index}>{paragraph.map((part, partIndex) => <React.Fragment key={partIndex}>{part}{partIndex < paragraph.length - 1 && <br />}</React.Fragment>)}</p>);
  }

  return <>{blocks}</>;
}
