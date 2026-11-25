import { Award, Calendar, Check, CheckCircle2, Info } from 'lucide-react'
import { useCallback, useEffect, useRef } from 'react'

import { CloseButton } from '@/components/ui'
import { useMandatoryGradeModalStore } from '@/stores/useMandatoryGradeModalStore'
import { clearColumnHighlight } from '@/utils/columnContourHighlight'
import {
  clearMandatoryTargetHighlight,
  executeFillMandatoryGrades,
  highlightMandatoryTargetCells,
} from '@/utils/mandatoryGradeAutomation'
import { MANDATORY_ASSESSMENT_REGEX } from '@/utils/studentStatusDOM'

import { useMandatoryModalPosition } from './useMandatoryModalPosition'

function renderHighlightedTopic(topic: string) {
  if (!topic) return 'Тема не вказана'

  const match = topic.match(MANDATORY_ASSESSMENT_REGEX)
  if (!match || match.index === undefined) {
    return topic
  }

  let matchedStr = match[0]
  let startIndex = match.index

  const leadingNonWord = matchedStr.match(/^[^\p{L}\p{N}]+/u)
  if (leadingNonWord) {
    startIndex += leadingNonWord[0].length
    matchedStr = matchedStr.slice(leadingNonWord[0].length)
  }

  const trailingNonWord = matchedStr.match(/[^\p{L}\p{N}]+$/u)
  if (trailingNonWord) {
    matchedStr = matchedStr.slice(0, -trailingNonWord[0].length)
  }

  if (!matchedStr) return topic

  const before = topic.slice(0, startIndex)
  const after = topic.slice(startIndex + matchedStr.length)

  return (
    <>
      {before}
      <span className="ha-mandatory-popup__topic-highlight">{matchedStr}</span>
      {after}
    </>
  )
}

export function MandatoryGradeModal() {
  const {
    isOpen,
    lessonTopic,
    lessonDateText,
    lessonBlock,
    colIndexStart,
    colIndexEnd,
    taskColIndex,
    lessonColIndex,
    eligibleStudentNames,
    primaryColTitle,
    secondaryColTitle,
    includeLessonCol,
    grade,
    isProcessing,
    currentProgress,
    totalProgress,
    closeModal,
    setIncludeLessonCol,
    setGrade,
    setIsProcessing,
    setProgress,
    requestStop,
  } = useMandatoryGradeModalStore()

  const isStoppingRef = useRef(false)
  const popupRef = useRef<HTMLDivElement>(null)

  // React to external closure (e.g. another action opening) while processing
  useEffect(() => {
    if (!isOpen && isProcessing) {
      isStoppingRef.current = true
      setIsProcessing(false)
    }
  }, [isOpen, isProcessing, setIsProcessing])

  const handleClose = useCallback(() => {
    if (isProcessing) {
      isStoppingRef.current = true
      requestStop()
      setIsProcessing(false)
    }
    clearMandatoryTargetHighlight()
    clearColumnHighlight()
    closeModal()
  }, [isProcessing, requestStop, setIsProcessing, closeModal])

  const pos = useMandatoryModalPosition({
    isOpen,
    lessonBlock,
    popupRef,
    colIndexStart,
    colIndexEnd,
    isProcessing,
    onClose: handleClose,
  })

  // Highlight cells to be filled during modal configuration
  useEffect(() => {
    if (!isOpen || isProcessing) return

    highlightMandatoryTargetCells(taskColIndex, lessonColIndex, includeLessonCol)

    const handleScrollOrResize = () => {
      highlightMandatoryTargetCells(taskColIndex, lessonColIndex, includeLessonCol)
    }

    window.addEventListener('scroll', handleScrollOrResize, true)
    window.addEventListener('resize', handleScrollOrResize)

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true)
      window.removeEventListener('resize', handleScrollOrResize)
      clearMandatoryTargetHighlight()
    }
  }, [isOpen, taskColIndex, lessonColIndex, includeLessonCol, isProcessing])

  // Clear highlight on unmount
  useEffect(() => {
    return () => {
      clearMandatoryTargetHighlight()
      clearColumnHighlight()
    }
  }, [])

  if (!isOpen) return null

  const handleStart = async () => {
    isStoppingRef.current = false
    setIsProcessing(true)

    await executeFillMandatoryGrades({
      taskColIndex,
      lessonColIndex,
      grade,
      includeLessonCol,
      onProgress: (current, total) => setProgress(current, total),
      isStopping: () => isStoppingRef.current || useMandatoryGradeModalStore.getState().isStopping,
    })

    clearMandatoryTargetHighlight()
    setIsProcessing(false)
    closeModal()
  }

  const grades = [1, 2, 3, 4, 5, 6]
  const progressPercent =
    totalProgress > 0 ? Math.round((currentProgress / totalProgress) * 100) : 0

  return (
    <div
      ref={popupRef}
      className="ha-mandatory-popup"
      style={{
        top: `${pos.top}px`,
        left: `${pos.left}px`,
      }}
    >
      <div className="ha-mandatory-popup__header">
        <div className="ha-mandatory-popup__title">
          <Award size={18} color="#2563eb" />
          <span>Проставити пропущені оцінки</span>
        </div>
        {!isProcessing && (
          <CloseButton className="ha-mandatory-popup__btn-close" onClick={handleClose} />
        )}
      </div>

      <div className="ha-mandatory-popup__body">
        <div className="ha-mandatory-popup__lesson-card">
          {lessonDateText && (
            <div className="ha-mandatory-popup__lesson-header">
              <span className="ha-mandatory-popup__date-badge">
                <Calendar size={12} strokeWidth={2.2} className="ha-mandatory-popup__date-icon" />
                <span>{lessonDateText}</span>
              </span>
            </div>
          )}
          <div className="ha-mandatory-popup__lesson-topic">
            {renderHighlightedTopic(lessonTopic)}
          </div>
        </div>

        <div>
          <div className="ha-mandatory-popup__section-label">Куди виставляти оцінки:</div>
          <div className="ha-mandatory-popup__columns-list">
            <div
              className="ha-mandatory-popup__col-row ha-mandatory-popup__col-row--task"
              title="Ця колонка обовʼязкова (не можна змінити)"
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <span className="ha-mandatory-popup__custom-checkbox ha-mandatory-popup__custom-checkbox--checked ha-mandatory-popup__custom-checkbox--disabled">
                  <Check size={12} strokeWidth={3} />
                </span>
                <span>Колонка «{primaryColTitle || 'Завдання'}»</span>
              </span>
              <span className="ha-mandatory-popup__badge-locked">Обовʼязково</span>
            </div>

            {lessonColIndex !== null && (
              <label
                className={`ha-mandatory-popup__col-row ha-mandatory-popup__col-row--lesson ${
                  includeLessonCol ? 'ha-mandatory-popup__col-row--lesson--active' : ''
                }`}
                style={{ cursor: isProcessing ? 'default' : 'pointer', margin: 0 }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    className={`ha-mandatory-popup__custom-checkbox ${
                      includeLessonCol ? 'ha-mandatory-popup__custom-checkbox--checked' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={isProcessing}
                      checked={includeLessonCol}
                      onChange={(e) => setIncludeLessonCol(e.target.checked)}
                      className="ha-mandatory-popup__hidden-checkbox"
                    />
                    {includeLessonCol && <Check size={12} strokeWidth={3} />}
                  </span>
                  <span>Продублювати оцінку в «{secondaryColTitle || 'Заняття'}»</span>
                </span>
              </label>
            )}
          </div>
        </div>

        <div>
          <div className="ha-mandatory-popup__section-label">Оберіть оцінку (1–6):</div>
          <div className="ha-mandatory-popup__grade-grid">
            {grades.map((num) => (
              <button
                key={num}
                type="button"
                disabled={isProcessing}
                onClick={() => setGrade(num)}
                className={`ha-mandatory-popup__grade-btn ${
                  grade === num ? 'ha-mandatory-popup__grade-btn--active' : ''
                }`}
              >
                {num}
              </button>
            ))}
          </div>
        </div>

        {!isProcessing &&
          (eligibleStudentNames.length === 0 ? (
            <div className="ha-mandatory-popup__notice ha-mandatory-popup__notice--empty">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <Info size={16} style={{ flexShrink: 0, marginTop: '2px', color: '#64748b' }} />
                <div style={{ width: '100%' }}>
                  <div
                    style={{
                      fontWeight: 600,
                      color: '#1e293b',
                      marginBottom: '2px',
                      fontSize: '12px',
                    }}
                  >
                    Немає учнів для виставлення оцінок
                  </div>
                  <div style={{ color: '#475569', fontSize: '11.5px', lineHeight: '1.45' }}>
                    Усі активні учні вже мають оцінки за цей урок, або мають відмітку відсутності
                    («Н») чи неактивний статус.
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="ha-mandatory-popup__notice">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                <CheckCircle2 size={15} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div style={{ width: '100%' }}>
                  <div>
                    Оцінку <strong>{grade}</strong> буде виставлено для{' '}
                    <strong>{eligibleStudentNames.length} активних учнів</strong>, у яких за цей
                    урок немає оцінки{' '}
                    {secondaryColTitle
                      ? `ні за «${primaryColTitle}», ні за «${secondaryColTitle}»`
                      : `за «${primaryColTitle}»`}
                    .
                  </div>

                  <div style={{ marginTop: '8px' }}>
                    <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                      До списку цих учнів входять:
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                        fontSize: '11.5px',
                        lineHeight: '1.45',
                        color: '#14532d',
                      }}
                    >
                      {eligibleStudentNames.map((name, idx) => (
                        <div key={idx}>
                          {idx + 1}. {name}
                        </div>
                      ))}
                    </div>
                  </div>

                  <ul
                    style={{
                      opacity: 0.9,
                      fontSize: '11px',
                      margin: '8px 0 0 0',
                      padding: '6px 0 0 16px',
                      borderTop: '1px solid #dcfce7',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      lineHeight: '1.35',
                    }}
                  >
                    <li>Учням з неактивними статусами оцінки не проставлятимуться.</li>
                    <li>Відвідуваність учнями уроку не змінюватиметься.</li>
                  </ul>
                </div>
              </div>
            </div>
          ))}

        {isProcessing && (
          <div style={{ marginTop: '4px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '12px',
                color: '#64748b',
                marginBottom: '4px',
              }}
            >
              <span>Проставлення оцінок...</span>
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
      </div>

      <div className="ha-mandatory-popup__footer">
        <button type="button" className="ha-mandatory-popup__btn-cancel" onClick={handleClose}>
          {isProcessing ? 'Зупинити' : 'Скасувати'}
        </button>

        <button
          type="button"
          disabled={isProcessing || eligibleStudentNames.length === 0}
          className="ha-mandatory-popup__btn-submit"
          onClick={handleStart}
        >
          {isProcessing ? 'Обробка...' : 'Виставити оцінки'}
        </button>
      </div>
    </div>
  )
}
