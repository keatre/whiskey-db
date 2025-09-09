'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Props = {
  children: string | null | undefined;
  className?: string;
};

export default function MarkdownViewer({ children, className }: Props) {
  if (!children) return null;

  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: (props) => (
            <table
              style={{
                borderCollapse: 'collapse',
                margin: '8px 0',
                width: 'auto',      // shrink to content
                maxWidth: '100%',   // prevent overflow on narrow screens
              }}
              {...props}
            />
          ),
          th: (props) => (
            <th
              style={{
                border: '1px solid rgba(255,255,255,0.2)',
                padding: '6px 12px',
                textAlign: 'left',
                fontWeight: 600,
              }}
              {...props}
            />
          ),
          td: (props) => (
            <td
              style={{
                border: '1px solid rgba(255,255,255,0.1)',
                padding: '6px 12px',
                verticalAlign: 'top',
              }}
              {...props}
            />
          ),
          // Optional: tighten lists a bit on mobile
          ul: (props) => <ul style={{ paddingLeft: '1.1rem', margin: '6px 0' }} {...props} />,
          ol: (props) => <ol style={{ paddingLeft: '1.2rem', margin: '6px 0' }} {...props} />,
          p:  (props) => <p style={{ margin: '6px 0' }} {...props} />,
          h1: (props) => <h1 style={{ margin: '10px 0 6px' }} {...props} />,
          h2: (props) => <h2 style={{ margin: '10px 0 6px' }} {...props} />,
          h3: (props) => <h3 style={{ margin: '10px 0 6px' }} {...props} />,
          a:  (props) => <a style={{ textDecoration: 'underline' }} {...props} />,
          code: (props) => (
            <code
              style={{
                background: 'rgba(255,255,255,0.06)',
                padding: '2px 4px',
                borderRadius: 4,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
              }}
              {...props}
            />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
