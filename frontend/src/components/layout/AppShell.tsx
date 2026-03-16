import { Outlet } from 'react-router'

export function AppShell() {
  return (
    <div className="flex flex-col min-h-screen">
      <Outlet />
    </div>
  )
}
