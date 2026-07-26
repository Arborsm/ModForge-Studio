import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Checkbox } from '../components/Checkbox'
import { ProgressBar } from '../components/ProgressBar'

interface UninstallPageProps {
  installPath: string
  isUninstalling: boolean
  uninstallCompleted: boolean
  uninstallError: string | null
  uninstallProgress: number
  onUninstall: (deleteUserData: boolean) => Promise<void>
  onClose: () => void
}

export function UninstallPage({
  installPath,
  isUninstalling,
  uninstallCompleted,
  uninstallError,
  uninstallProgress,
  onUninstall,
  onClose,
}: UninstallPageProps) {
  const { t } = useTranslation()
  const [deleteUserData, setDeleteUserData] = useState(false)

  return (
    <div className="uninstall-page">
      <div className="page-scroll">
        <div className="page-container page-container--center">
          <div className="uninstall-card">
            <div className="uninstall-title">{t('uninstall.title')}</div>
            <div className="uninstall-subtitle">{t('uninstall.subtitle')}</div>

            <div className="uninstall-inline-meta" title={installPath || t('uninstall.pathUnknown')}>
              <span className="uninstall-inline-label">{t('uninstall.installPath')}:</span>
              <span className="uninstall-inline-path">{installPath || t('uninstall.pathUnknown')}</span>
            </div>

            {!uninstallCompleted && (
              <div className="uninstall-delete-data">
                <Checkbox
                  checked={deleteUserData}
                  onChange={(checked) => {
                    if (!isUninstalling) setDeleteUserData(checked)
                  }}
                  label={t('uninstall.deleteData')}
                />
                <div className="uninstall-delete-data-hint">{t('uninstall.deleteDataHint')}</div>
              </div>
            )}

            {uninstallError && <div className="uninstall-error">{uninstallError}</div>}

            {uninstallCompleted && <div className="uninstall-success">{t('uninstall.completed')}</div>}

            {(isUninstalling || uninstallCompleted) && (
              <div className="uninstall-progress-wrap">
                <ProgressBar percent={uninstallProgress} completed={uninstallCompleted} />
                <span className="uninstall-progress-text">{uninstallProgress}%</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="page-footer">
        <div className="uninstall-actions" style={{ width: '100%' }}>
          <button className="btn btn-ghost" onClick={onClose}>
            {t(uninstallCompleted ? 'uninstall.close' : 'uninstall.cancel')}
          </button>
          {!uninstallCompleted && (
            <button
              className="btn btn-primary"
              disabled={isUninstalling}
              onClick={() => {
                void onUninstall(deleteUserData)
              }}
            >
              {isUninstalling ? t('uninstall.uninstalling') : t('uninstall.confirm')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
