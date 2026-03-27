import { useState } from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { theme } from '../styles/theme';

interface SidePanelProps {
  children: React.ReactNode;
  title?: string;
}

export default function SidePanel({ children, title }: SidePanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{
          position: 'absolute',
          top: 80,
          right: collapsed ? 16 : 396,
          zIndex: 51,
          width: 32,
          height: 32,
          borderRadius: theme.radius.full,
          background: theme.glass.background,
          backdropFilter: theme.glass.backdropFilter,
          border: theme.glass.border,
          color: theme.colors.textPrimary,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: theme.transitions.smooth,
          boxShadow: theme.shadows.card,
        }}
      >
        {collapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
      </button>

      {/* Panel */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          right: collapsed ? -400 : 16,
          bottom: 16,
          width: 380,
          zIndex: 50,
          background: theme.glass.background,
          backdropFilter: theme.glass.backdropFilter,
          border: theme.glass.border,
          borderRadius: theme.radius.lg,
          boxShadow: theme.shadows.panel,
          transition: 'right 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        {title && (
          <div
            style={{
              padding: '20px 24px 16px',
              borderBottom: `1px solid ${theme.colors.border}`,
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 700,
                color: theme.colors.textPrimary,
              }}
            >
              {title}
            </h2>
          </div>
        )}

        {/* Content */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 24px',
          }}
          className="hide-scrollbar"
        >
          {children}
        </div>
      </div>
    </>
  );
}
