import { Calendar, Check, CheckCircle2, Copy, Info } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { CloseButton } from '@/components/ui'

import { useCopyGradesStore } from '@/stores/useCopyGradesStore'
import {
  type AutomationLessonOption,
  type CopyDirection,
  type CopyGradeItem,
  clearCopyTargetHighlight,
  executeFillCellGrade,
  getAllEligibleCopyItemsForPeriod,
  highlightCopyTargetCells,
} from '@/utils/gradebookAutomation'
import { refreshStudentStatusBadges } from '@/utils/studentStatusDOM'

export function CopyGradesAutomation() {
  const { isOpen, isProcessing, openModal, closeModal, setIsProcessing, setIsStopping } =
    useCopyGradesStore()

  const [lessons, setLessons] = useState<AutomationLessonOption[]>([])
  const [periodTitle, setPeriodTitle] = useState<string>('Поточний період')
  const [direction, setDirection] = useState<CopyDirection>('taskToLesson')
  const [overwriteLower, setOverwriteLower] = useState<boolean>(false)

  const [eligibleItems, setEligibleItems] = useState<CopyGradeItem[]>([])
  const [currentProgress, setCurrentProgress] = useState<number>(0)
  const [totalProgress, setTotalProgress] = useState<number>(0)

  const isStoppingRef = useRef(false)

  // React to external closure (e.g. another action opening) while processing
  useEffect(() => {
    if (!isOpen && isProcessing) {
      isStoppingRef.current = true
      setIsProcessing(false)
    }
  }, [isOpen, isProcessing, setIsProcessing])

  // 1. Calculate eligible items and highlight all target cells across the whole month/period ONLY when open
  useEffect(() => {
    if (!isOpen || isProcessing) return

    const {
      items,
      lessons: discoveredLessons,
      periodTitle: detectedTitle,
    } = getAllEligibleCopyItemsForPeriod(direction, overwriteLower)

    setLessons(discoveredLessons)
    setPeriodTitle(detectedTitle)
    setEligibleItems(items)

    // Highlight all target cells across all lessons of the period in the journal
    const targetCells = items.map((it) => it.targetCell)
    highlightCopyTargetCells(targetCells)

    return () => {
      clearCopyTargetHighlight()
    }
  }, [isOpen, direction, overwriteLower, isProcessing])

  // Clear highlight on unmount
  useEffect(() => {
    return () => {
      clearCopyTargetHighlight()
    }
  }, [])

  const handleClose = () => {
    if (isProcessing) {
      isStoppingRef.current = true
      setIsStopping(true)
    }
    clearCopyTargetHighlight()
    closeModal()
  }

  // 2. Execution handler
  const handleStartCopy = async () => {
    if (eligibleItems.length === 0 || isProcessing) return

    isStoppingRef.current = false
    setIsStopping(false)
    setIsProcessing(true)
    setCurrentProgress(0)
    setTotalProgress(eligibleItems.length)

    for (let i = 0; i < eligibleItems.length; i++) {
      if (isStoppingRef.current || useCopyGradesStore.getState().isStopping) break

      const item = eligibleItems[i]
      await executeFillCellGrade(item.targetCell, item.sourceGrade, isStoppingRef)

      setCurrentProgress(i + 1)
    }

    setIsProcessing(false)
    clearCopyTargetHighlight()
    refreshStudentStatusBadges()

    // Re-evaluate eligible items after copying
    const { items } = getAllEligibleCopyItemsForPeriod(direction, overwriteLower)
    setEligibleItems(items)
  }

  const handleStop = () => {
    isStoppingRef.current = true
    setIsStopping(true)
    setIsProcessing(false)
    clearCopyTargetHighlight()
  }

  // --- Initial collapsed state: user only sees the trigger action ---
  if (!isOpen) {
    return (
      <div className="ha-automation-entry">
        <div className="ha-automation-entry__header">
          <span className="ha-automation-entry__title">Копіювання оцінок</span>
        </div>
        <p className="ha-automation-entry__desc">
          Копіювання оцінок між колонками «Завдання» та «Заняття» для всіх уроків поточного періоду
          (місяць).
        </p>
        <button type="button" className="ha-automation-open-btn" onClick={openModal}>
          <Copy size={15} />
          <span>Скопіювати оцінки</span>
        </button>
      </div>
    )
  }

  // --- Empty lessons state ---
  if (lessons.length === 0) {
    return (
      <div className="ha-automation-settings">
        <div className="ha-automation-settings__top-bar">
          <span className="ha-automation-settings__title">
            <Copy size={15} className="text-primary" />
            Копіювання оцінок
          </span>
          <CloseButton className="ha-automation-close-btn" onClick={handleClose} />
        </div>
        <div className="ha-automation-empty-notice">
          <Info size={16} className="text-muted flex-shrink-0" />
          <span className="text-muted" style={{ fontSize: '12px', lineHeight: '1.4' }}>
            Не знайдено уроків з колонками «Завдання» та «Заняття» у поточному періоді.
          </span>
        </div>
        <button type="button" className="ha-automation-cancel-btn w-100 mt-2" onClick={handleClose}>
          Назад
        </button>
      </div>
    )
  }

  const progressPercent =
    totalProgress > 0 ? Math.round((currentProgress / totalProgress) * 100) : 0

  return (
    <div className="ha-automation-settings">
      <div className="ha-automation-settings__top-bar">
        <span className="ha-automation-settings__title">
          <Copy size={15} className="text-primary" />
          Налаштування копіювання
        </span>
        {!isProcessing && (
          <CloseButton
            className="ha-automation-close-btn"
            onClick={handleClose}
            aria-label="Закрити налаштування"
          />
        )}
      </div>

      <div className="ha-automation-period-badge">
        <div className="ha-automation-period-label">
          <Calendar size={14} className="text-primary flex-shrink-0" />
          <span>Період копіювання:</span>
        </div>
        <span className="ha-automation-period-value">{periodTitle}</span>
      </div>

      <div className="mb-2.5">
        <div className="ha-automation-sublabel">Напрямок копіювання:</div>
        <div className="ha-automation-direction-grid">
          <button
            type="button"
            disabled={isProcessing}
            onClick={() => setDirection('taskToLesson')}
            className={`ha-automation-direction-btn ${
              direction === 'taskToLesson' ? 'ha-automation-direction-btn--active' : ''
            }`}
          >
            <span>Завдання</span>
            <span className="ha-automation-arrow">→</span>
            <span>Заняття</span>
          </button>

          <button
            type="button"
            disabled={isProcessing}
            onClick={() => setDirection('lessonToTask')}
            className={`ha-automation-direction-btn ${
              direction === 'lessonToTask' ? 'ha-automation-direction-btn--active' : ''
            }`}
          >
            <span>Заняття</span>
            <span className="ha-automation-arrow">→</span>
            <span>Завдання</span>
          </button>
        </div>
      </div>

      <div className="ha-automation-checkbox-container">
        <label
          className="ha-automation-checkbox-label"
          style={{ cursor: isProcessing ? 'default' : 'pointer' }}
        >
          <span
            className={`ha-mandatory-popup__custom-checkbox ${
              overwriteLower ? 'ha-mandatory-popup__custom-checkbox--checked' : ''
            }`}
          >
            <input
              type="checkbox"
              disabled={isProcessing}
              checked={overwriteLower}
              onChange={(e) => setOverwriteLower(e.target.checked)}
              className="ha-mandatory-popup__hidden-checkbox"
            />
            {overwriteLower && <Check size={12} strokeWidth={3} />}
          </span>
          <span className="ha-automation-checkbox-title">Перезаписувати меншу оцінку</span>
        </label>
        <div className="ha-automation-checkbox-desc">
          {overwriteLower
            ? 'Копіювати у порожні та замінювати нижчий бал на вищий.'
            : 'Копіювати лише в порожні клітинки (існуючі оцінки не змінюються).'}
        </div>
      </div>

      {!isProcessing && (
        <div
          className={`ha-automation-notice ${
            eligibleItems.length > 0
              ? 'ha-automation-notice--success'
              : 'ha-automation-notice--empty'
          }`}
        >
          {eligibleItems.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <CheckCircle2 size={16} color="#16a34a" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: '11.5px', lineHeight: '1.45' }}>
                Буде скопійовано{' '}
                <strong style={{ color: '#15803d' }}>
                  {eligibleItems.length}{' '}
                  {eligibleItems.length === 1
                    ? 'оцінку'
                    : eligibleItems.length < 5
                      ? 'оцінки'
                      : 'оцінок'}
                </strong>{' '}
                для всього поточного періоду (<strong>{lessons.length} уроків</strong>). Усі цільові
                клітинки підсвічено синім контуром у журналі.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <Info size={16} color="#94a3b8" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: '11.5px', color: '#64748b', lineHeight: '1.45' }}>
                Немає оцінок для копіювання за обраним напрямком у поточному періоді.
              </div>
            </div>
          )}
        </div>
      )}

      {isProcessing && (
        <div style={{ marginBottom: '12px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '12px',
              color: '#475569',
              marginBottom: '5px',
            }}
          >
            <span>Копіювання оцінок...</span>
            <span style={{ fontWeight: 600 }}>
              {currentProgress} з {totalProgress} ({progressPercent}%)
            </span>
          </div>
          <div
            style={{
              width: '100%',
              height: '8px',
              background: '#e2e8f0',
              borderRadius: '4px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${progressPercent}%`,
                height: '100%',
                background: '#2563eb',
                transition: 'width 0.2s ease',
              }}
            />
          </div>
        </div>
      )}

      <div>
        {!isProcessing ? (
          <div className="ha-automation-footer-btns">
            <button type="button" className="ha-automation-cancel-btn" onClick={handleClose}>
              Скасувати
            </button>
            <button
              type="button"
              disabled={eligibleItems.length === 0}
              onClick={handleStartCopy}
              className="ha-automation-submit-btn"
            >
              <Copy size={14} />
              <span>Скопіювати ({eligibleItems.length})</span>
            </button>
          </div>
        ) : (
          <button type="button" onClick={handleStop} className="ha-automation-stop-btn">
            <span>Зупинити копіювання</span>
          </button>
        )}
      </div>
    </div>
  )
}
