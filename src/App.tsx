import { ArrowRight, BookOpen, Calendar, SlidersHorizontal } from 'lucide-react'

import { AutomationSection } from '@/components/Automation/AutomationSection'
import Header from '@/components/Header'
import { MandatoryGradeModal } from '@/components/MandatoryGradeModal/MandatoryGradeModal'
import { Card, Form, SidePanel } from '@/components/ui'
import { useCopyGradesStore } from '@/stores/useCopyGradesStore'
import useModalStore from '@/stores/useModalStore'
import useSettingsStore from '@/stores/useSettingsStore'
import { setPanelOpenState } from '@/utils/syncStorage'

function App() {
  const { showModalBasic, setShowModalBasic } = useModalStore()
  const { settings, updateSetting } = useSettingsStore()
  const extensionVersion = chrome.runtime?.getManifest?.()?.version ?? ''

  const handleClose = () => {
    useCopyGradesStore.getState().closeModal()
    setShowModalBasic(false)
    void setPanelOpenState(false)
  }

  return (
    <>
      <MandatoryGradeModal />

      <SidePanel show={showModalBasic} onClose={handleClose}>
        <div className="ha-drawer-form">
          <Header />
          <SidePanel.Body>
            <AutomationSection />

            {/* Єдиний блок Налаштування з внутрішнім групуванням */}
            <Card className="mt-3">
              <Card.Body>
                <div className="ha-section-header">
                  <SlidersHorizontal size={17} className="text-primary" />
                  <span className="ha-section-header__title">Налаштування</span>
                </div>

                {/* Підгрупа: Розклад уроків (Календар) */}
                <div className="ha-settings-subgroup">
                  <div className="ha-settings-subgroup__header">
                    <div className="ha-settings-subgroup__title">
                      <Calendar size={16} />
                      <span>Розклад уроків</span>
                    </div>
                  </div>

                  <div className="ha-setting-item">
                    <Form.Check
                      type="switch"
                      id="setting-highlight-unpublished-lessons"
                      label="Неопубліковані уроки та невидані завдання"
                      checked={settings.highlightUnpublishedLessons ?? true}
                      onChange={(e) =>
                        updateSetting('highlightUnpublishedLessons', e.target.checked)
                      }
                    />
                    <Form.Text className="text-muted d-block mt-1">
                      Підсвічує уроки, які ще не створено, не опубліковано або де не видано домашнє
                      завдання.
                    </Form.Text>
                  </div>

                  <div className="ha-setting-item ha-setting-item--bordered">
                    <Form.Check
                      type="switch"
                      id="setting-highlight-video-conference"
                      label="Іконки типу уроку (онлайн / самостійний)"
                      checked={settings.highlightVideoConference ?? true}
                      onChange={(e) => updateSetting('highlightVideoConference', e.target.checked)}
                    />
                    <Form.Text className="text-muted d-block mt-1">
                      Виділяє онлайн-уроки з відеоконференцією та додає іконку книги для занять для
                      самостійного опрацювання.
                    </Form.Text>
                  </div>
                </div>

                {/* Підгрупа: Журнал оцінок та учні */}
                <div className="ha-settings-subgroup">
                  <div className="ha-settings-subgroup__header">
                    <div className="ha-settings-subgroup__title">
                      <BookOpen size={16} />
                      <span>Журнал та сторінка уроку</span>
                    </div>
                  </div>

                  <div className="ha-setting-item">
                    <Form.Check
                      type="switch"
                      id="setting-show-student-statuses"
                      label="Відмічати та відображати статус учнів"
                      checked={settings.showStudentStatuses ?? true}
                      onChange={(e) => updateSetting('showStudentStatuses', e.target.checked)}
                    />
                    <Form.Text className="text-muted d-block mt-1">
                      Додає меню «3 крапки» біля імені учня для призначення статусу (вибув, сімейна
                      форма, за кордоном) та показує відповідні бейджі.
                    </Form.Text>
                  </div>

                  <div className="ha-setting-item ha-setting-item--bordered">
                    <Form.Check
                      type="switch"
                      id="setting-highlight-absent-inactive"
                      label="Підсвічувати помилкові «Н» та «Запізнився» у неактивних"
                      checked={
                        (settings.showStudentStatuses ?? true) &&
                        (settings.highlightAbsentForInactive ?? true)
                      }
                      onChange={(e) =>
                        updateSetting('highlightAbsentForInactive', e.target.checked)
                      }
                      disabled={!(settings.showStudentStatuses ?? true)}
                    />
                    <Form.Text className="text-muted d-block mt-1">
                      Підсвічує випадки, коли учням зі спеціальним статусом (вибув, сімейник, за
                      кордоном) помилково виставлено відмітку відсутності або запізнення.
                    </Form.Text>
                  </div>

                  <div className="ha-setting-item ha-setting-item--bordered">
                    <Form.Check
                      type="switch"
                      id="setting-highlight-mandatory-works"
                      label="Обовʼязкові роботи та пропущені оцінки"
                      checked={settings.highlightMandatoryWorks ?? true}
                      onChange={(e) => updateSetting('highlightMandatoryWorks', e.target.checked)}
                    />
                    <Form.Text className="text-muted d-block mt-1">
                      Виділяє стовпчики обовʼязкових робіт (практичні, діагностичні, контрольні) у
                      журналі, підсвічує порожні клітинки та оцінки за такі роботи на сторінці
                      підсумкового оцінювання.
                    </Form.Text>
                  </div>

                  <div className="ha-setting-item ha-setting-item--bordered">
                    <Form.Check
                      type="switch"
                      id="setting-highlight-grade-mismatch"
                      label="Різні оцінки в «Заняття» та «Завдання»"
                      checked={settings.highlightGradeMismatch ?? true}
                      onChange={(e) => updateSetting('highlightGradeMismatch', e.target.checked)}
                    />
                    <Form.Text className="text-muted d-block mt-1">
                      Підсвічує комірки, де в одному уроці оцінка за заняття відрізняється від
                      оцінки за завдання.
                    </Form.Text>
                  </div>
                </div>
              </Card.Body>
            </Card>
          </SidePanel.Body>
          <div className="ha-side-panel__corner-bar">
            {extensionVersion ? (
              <span className="ha-side-panel__version">v{extensionVersion}</span>
            ) : (
              <span />
            )}
            <button type="button" className="ha-side-panel__close-link" onClick={handleClose}>
              <span>Закрити</span>
              <ArrowRight size={18} className="ha-close-arrow" />
            </button>
          </div>
        </div>
      </SidePanel>
    </>
  )
}

export default App
