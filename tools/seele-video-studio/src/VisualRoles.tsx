import React from 'react';

type Theme = {paper: string; ink: string; accent: string; line: string};
type BaseProps = {theme: Theme};

export const HeadingRole: React.FC<BaseProps & {eyebrow: string; children: React.ReactNode}> = ({theme, eyebrow, children}) => (
  <section style={{color: theme.ink}}>
    <div className="eyebrow" style={{color: theme.accent, marginBottom: 20}}>{eyebrow}</div>
    <div className="display" style={{fontSize: 118, lineHeight: .86}}>{children}</div>
  </section>
);

export const BulletRole: React.FC<BaseProps & {index: number; children: React.ReactNode}> = ({theme, index, children}) => (
  <div style={{display: 'grid', gridTemplateColumns: '74px 1fr', gap: 24, alignItems: 'start', color: theme.ink, padding: '22px 0', borderTop: `1px solid ${theme.line}`}}>
    <span className="display" style={{fontSize: 48, color: theme.accent}}>{String(index).padStart(2, '0')}</span>
    <span className="serif" style={{fontSize: 38, lineHeight: 1.15}}>{children}</span>
  </div>
);

export const QuoteRole: React.FC<BaseProps & {quote: string; source: string; locator?: string}> = ({theme, quote, source, locator}) => (
  <figure style={{margin: 0, color: theme.ink, borderLeft: `8px solid ${theme.accent}`, padding: '16px 0 16px 42px'}}>
    <blockquote className="serif" style={{margin: 0, fontSize: 52, lineHeight: 1.1, fontStyle: 'italic'}}>„{quote}“</blockquote>
    <figcaption className="eyebrow" style={{marginTop: 26, color: theme.accent}}>{source}{locator ? ` · ${locator}` : ''}</figcaption>
  </figure>
);

export const EmbeddedVideoRole: React.FC<BaseProps & {title: string; source: string; children?: React.ReactNode}> = ({theme, title, source, children}) => (
  <figure style={{margin: 0, color: theme.ink}}>
    <div style={{position: 'relative', aspectRatio: '16 / 9', overflow: 'hidden', border: `1px solid ${theme.line}`, background: '#0d0d0d'}}>
      {children}
      <div className="eyebrow" style={{position: 'absolute', left: 24, top: 22, padding: '10px 14px', color: theme.paper, background: theme.ink}}>VIDEOAUSSCHNITT</div>
    </div>
    <figcaption style={{display: 'flex', justifyContent: 'space-between', gap: 30, paddingTop: 16, borderBottom: `1px solid ${theme.line}`}}>
      <strong className="serif" style={{fontSize: 28}}>{title}</strong>
      <span className="eyebrow" style={{fontSize: 14, color: theme.accent}}>{source}</span>
    </figcaption>
  </figure>
);

export const SourceEndRole: React.FC<BaseProps & {title: string; url: string}> = ({theme, title, url}) => (
  <section style={{color: theme.ink, borderTop: `1px solid ${theme.line}`, paddingTop: 28}}>
    <div className="eyebrow" style={{color: theme.accent}}>ARTIKEL UND QUELLEN</div>
    <div className="display" style={{fontSize: 94, lineHeight: .9, marginTop: 20}}>{title}</div>
    <div className="eyebrow" style={{marginTop: 30}}>{url.replace('https://', '')}</div>
  </section>
);
