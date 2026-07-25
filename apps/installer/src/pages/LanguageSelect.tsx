import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { detectInstallerUiLanguage, INSTALLER_LANGUAGES, type InstallerUiLanguage } from '../i18n/languages'
import logoUrl from '../logo.png'

interface LanguageSelectProps {
  onSelect: (lang: InstallerUiLanguage) => void
}

export function LanguageSelect({ onSelect }: LanguageSelectProps) {
  const { i18n } = useTranslation()
  const [selected, setSelected] = useState<InstallerUiLanguage>(() => detectInstallerUiLanguage())

  const handleSelect = (code: InstallerUiLanguage) => {
    setSelected(code)
    i18n.changeLanguage(code)
  }

  const handleContinue = () => {
    if (selected) onSelect(selected)
  }

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'row',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          flex: '0 0 42%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
          background: 'var(--color-bg-primary)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            right: 0,
            width: 1,
            backgroundImage: `linear-gradient(180deg, var(--border-subtle) 0%, var(--border-subtle) 50%, transparent 50%, transparent 100%)`,
            backgroundSize: '1px 8px',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        />

        <div
          style={{
            textAlign: 'center',
            maxWidth: 280,
            padding: '0 24px',
            animation: 'heroContentFadeIn 0.8s ease-out 0.3s both',
          }}
        >
          <img
            src={logoUrl}
            alt="ModForge Studio"
            style={{
              display: 'block',
              margin: '0 auto 16px',
              width: 56,
              height: 56,
              borderRadius: 14,
              filter: 'drop-shadow(0 0 40px color-mix(in srgb, var(--color-accent-500) 8%, transparent))',
            }}
          />
          <h1
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 32,
              fontWeight: 700,
              color: 'var(--color-text-primary)',
              letterSpacing: '-0.03em',
              lineHeight: 1.05,
              margin: '0 0 16px 0',
              textShadow: '0 0 60px color-mix(in srgb, var(--color-accent-500) 15%, transparent)',
            }}
          >
            ModForge
            <br />
            Studio
          </h1>
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: 24,
            left: 0,
            right: 0,
            zIndex: 2,
            animation: 'fadeIn 1s ease-out 0.8s both',
          }}
        >
          <div
            style={{
              maxWidth: 280,
              margin: '0 auto',
              padding: '0 24px',
              textAlign: 'center',
              fontSize: 11,
              color: 'var(--color-text-muted)',
              opacity: 0.6,
              letterSpacing: '0.5px',
            }}
          >
            Version 0.1.0
          </div>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div className="page-scroll" style={{ padding: '24px 32px 18px' }}>
          <div className="page-container page-container--center" style={{ maxWidth: 320 }}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
                width: '100%',
                animation: 'fadeIn 0.5s ease-out',
              }}
            >
              <div className="section-label">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
                Select Language / {'选择语言'}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {INSTALLER_LANGUAGES.map((lang) => {
                  const isSelected = selected === lang.uiCode
                  return (
                    <button
                      key={lang.uiCode}
                      onClick={() => handleSelect(lang.uiCode)}
                      className={`lang-item ${isSelected ? 'is-selected' : ''}`}
                    >
                      <div className="lang-item-text">
                        <div className="lang-item-name">{lang.nativeName}</div>
                        <div className="lang-item-label">{lang.label}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="page-footer page-footer--center">
          <button
            className={`btn ${selected ? 'btn-primary' : ''}`}
            onClick={handleContinue}
            disabled={!selected}
            style={{
              justifyContent: 'center',
            }}
          >
            {INSTALLER_LANGUAGES.find((language) => language.uiCode === selected)?.continueLabel}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
