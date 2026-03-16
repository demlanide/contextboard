import { BrowserRouter, Routes, Route } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { HomePage } from '@/pages/HomePage'
import { BoardPage } from '@/pages/BoardPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/boards/:boardId" element={<BoardPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
