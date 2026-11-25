import { SidePanel } from '@/components/ui'

const logoUrl = chrome.runtime.getURL('icons/logo.svg')

function Header() {
  return (
    <SidePanel.Header closeButton>
      <SidePanel.Title as="h5">
        <div className="d-flex align-items-center gap-2">
          <img
            src={logoUrl}
            alt="Human Boost Logo"
            width={24}
            height={24}
            style={{
              display: 'block',
              borderRadius: '50%',
              flexShrink: 0,
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.15)',
            }}
          />
          <span className="fw-bold">Human Boost</span>
        </div>
      </SidePanel.Title>
    </SidePanel.Header>
  )
}

export default Header
