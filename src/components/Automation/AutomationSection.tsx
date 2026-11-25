import { Sparkles } from 'lucide-react'

import { Card } from '@/components/ui'

import { CopyGradesAutomation } from './CopyGradesAutomation'

export function AutomationSection() {
  return (
    <Card className="ha-automation-card">
      <Card.Body>
        <div className="ha-section-header">
          <Sparkles size={17} className="text-primary" />
          <span className="ha-section-header__title">Автоматизація дій</span>
        </div>

        <CopyGradesAutomation />
      </Card.Body>
    </Card>
  )
}
