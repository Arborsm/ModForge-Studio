import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { WindowControls } from './components/WindowControls'
import { LanguageSelect } from './pages/LanguageSelect'
import { Options } from './pages/Options'
import { Preferences } from './pages/Preferences'
import { ProgressPage } from './pages/Progress'
import { Finish } from './pages/Finish'
import { UninstallPage } from './pages/Uninstall'
import { useInstaller } from './hooks/useInstaller'
import { useInstallerTheme } from './theme/useInstallerTheme'
import { mapUiLanguageToAppLanguage, type InstallerUiLanguage } from './i18n/languages'
import type { InstallStep } from './types/installer'
import './styles/global.css'

const STEP_NUMBERS: Record<string, number> = {
  options: 2,
  preferences: 3,
  progress: 4,
  finish: 5,
}

/** Wizard order used to pick the slide direction for page transitions. */
const STEP_ORDER: InstallStep[] = ['lang', 'options', 'preferences', 'progress', 'finish']

function App() {
  const installer = useInstaller()
  const { resolvedTheme, toggleTheme } = useInstallerTheme()
  const { t, i18n } = useTranslation()

  const previousStepRef = useRef<InstallStep>(installer.step)
  useEffect(() => {
    previousStepRef.current = installer.step
  }, [installer.step])
  const previousIndex = STEP_ORDER.indexOf(previousStepRef.current)
  const currentIndex = STEP_ORDER.indexOf(installer.step)
  const pageDirection = currentIndex >= 0 && previousIndex >= 0 && currentIndex < previousIndex ? 'back' : 'forward'

  const handleLanguageSelect = (lang: InstallerUiLanguage) => {
    i18n.changeLanguage(lang)
    installer.setOptions((prev) => ({
      ...prev,
      appLanguage: mapUiLanguageToAppLanguage(lang),
    }))
    installer.next()
  }

  const STEP_TITLES: Record<string, string> = {
    options: t('options.title'),
    preferences: t('preferences.title'),
    progress: t('progress.title'),
    finish: t('finish.title'),
    uninstall: t('uninstall.title'),
  }

  const renderPage = () => {
    switch (installer.step) {
      case 'lang':
        return <LanguageSelect onSelect={handleLanguageSelect} />
      case 'options':
        return (
          <Options
            options={installer.options}
            setOptions={installer.setOptions}
            diskSpace={installer.diskSpace}
            error={installer.error}
            refreshDiskSpace={installer.refreshDiskSpace}
            existingInstall={installer.existingInstall}
            onLaunchRegisteredUninstaller={installer.launchRegisteredUninstaller}
            onBack={installer.back}
            onNext={installer.next}
            clearInstallError={installer.clearInstallError}
          />
        )
      case 'preferences':
        return (
          <Preferences
            preferences={installer.appPreferences}
            setPreferences={installer.setAppPreferences}
            onCloseBehaviorSelected={installer.markCloseBehaviorTouched}
            isInstalling={installer.isInstalling}
            persistError={installer.preferencesError}
            onPersistPreferences={installer.persistAppPreferences}
            onBack={installer.back}
            onInstall={installer.install}
          />
        )
      case 'progress':
        return (
          <ProgressPage
            progress={installer.progress}
            error={installer.error}
            canConfirmProgress={installer.canConfirmProgress}
            onConfirmProgress={installer.confirmProgress}
            onRetry={installer.retryInstall}
            onBackToOptions={installer.backToOptions}
          />
        )
      case 'finish':
        return (
          <Finish
            installPath={installer.options.installPath}
            launchAfterInstall={installer.options.launchAfterInstall}
            onToggleLaunchAfterInstall={(value) => installer.setOptions((prev) => ({ ...prev, launchAfterInstall: value }))}
            onLaunch={installer.launchApp}
            onClose={installer.closeInstaller}
          />
        )
      case 'uninstall':
        return (
          <UninstallPage
            installPath={installer.options.installPath}
            isUninstalling={installer.isUninstalling}
            uninstallCompleted={installer.uninstallCompleted}
            uninstallError={installer.uninstallError}
            uninstallProgress={installer.uninstallProgress}
            onUninstall={installer.startUninstall}
            onClose={installer.closeInstaller}
          />
        )
      default:
        return null
    }
  }

  const isFullscreen = installer.step === 'lang' || installer.step === 'uninstall'
  const stepNum = STEP_NUMBERS[installer.step]
  const defaultTitle = t('shared.product.name')
  const title = STEP_TITLES[installer.step] || defaultTitle
  const useSuccessStepColor = installer.installationCompleted

  return (
    <div className="installer-app">
      <div className="titlebar" data-tauri-drag-region>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="titlebar-title">
            {isFullscreen ? (
              defaultTitle
            ) : (
              <>
                <span style={{ opacity: 0.4 }}>{stepNum} / 5</span>
                <span style={{ margin: '0 6px', opacity: 0.2 }}>·</span>
                <span>{title}</span>
              </>
            )}
          </span>
        </div>
        <WindowControls resolvedTheme={resolvedTheme} onToggleTheme={toggleTheme} />
      </div>

      {!isFullscreen && (
        <div
          style={{
            height: 1,
            background: 'repeating-linear-gradient(90deg, var(--element-bg-medium) 0 5px, transparent 5px 10px)',
            position: 'relative',
            flexShrink: 0,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${((stepNum ?? 0) / 5) * 100}%`,
              background: useSuccessStepColor
                ? 'repeating-linear-gradient(90deg, var(--color-success) 0 5px, transparent 5px 10px)'
                : 'repeating-linear-gradient(90deg, var(--color-accent-500) 0 5px, transparent 5px 10px)',
              transition: 'width 400ms cubic-bezier(0.4, 0, 0.2, 1), background 300ms ease',
            }}
          />
        </div>
      )}

      <div className="installer-content">
        <div key={installer.step} className={`wizard-page wizard-page--${pageDirection}`}>
          {renderPage()}
        </div>
      </div>
    </div>
  )
}

export default App
