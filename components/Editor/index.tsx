'use client'

import dynamic from 'next/dynamic'

const ThreeEditor = dynamic(() => import('./ThreeEditor'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[calc(100vh-52px)] bg-[#0f1117] flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-3 border-[#22c55e]/20 border-t-[#22c55e] rounded-full animate-spin mx-auto mb-4" />
        <p className="text-[#71717a]">Loading editor...</p>
      </div>
    </div>
  )
})

export default ThreeEditor

