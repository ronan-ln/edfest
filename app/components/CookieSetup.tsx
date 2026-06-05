'use client'

import { useState } from 'react'

const LS_KEY = 'edfest_cookie'
const LS_NAME_KEY = 'edfest_firstname'

export function getCookie(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(LS_KEY) ?? ''
}

export function getFirstName(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(LS_NAME_KEY) ?? ''
}

interface CookieSetupProps {
  onClose: () => void
  onSaved: (firstName: string) => void
}

export function CookieSetup({ onClose, onSaved }: CookieSetupProps) {
  const [value, setValue] = useState(() =>
    typeof window !== 'undefined' ? (localStorage.getItem(LS_KEY) ?? '') : ''
  )
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)

  function save() {
    localStorage.setItem(LS_KEY, value.trim())
    // Persist name if already fetched via test; otherwise clear stale name
    if (!testResult?.startsWith('✓')) localStorage.removeItem(LS_NAME_KEY)
    const firstName = getFirstName()
    onSaved(firstName)
    onClose()
  }

  function clear() {
    localStorage.removeItem(LS_KEY)
    localStorage.removeItem(LS_NAME_KEY)
    setValue('')
    setTestResult(null)
  }

  async function test() {
    setTesting(true)
    setTestResult(null)
    try {
      const cookie = value.trim()
      const [userRes, basketRes] = await Promise.all([
        fetch('/api/user', { headers: { 'x-edfest-cookie': cookie } }),
        fetch('/api/basket', { headers: { 'x-edfest-cookie': cookie } }),
      ])
      const userData = userRes.ok ? await userRes.json() : null
      const basketData = basketRes.ok ? await basketRes.json() : null

      const firstName: string = userData?.firstname ?? userData?.user?.firstname ?? userData?.first_name ?? ''
      const tickets: number = basketData?.basket?.summary?.notickets ?? 0

      if (userRes.ok && firstName) {
        localStorage.setItem(LS_NAME_KEY, firstName)
        setTestResult(`✓ Connected as ${firstName} — ${tickets} ticket${tickets !== 1 ? 's' : ''} in basket`)
      } else if (basketRes.ok && basketData?.basket) {
        localStorage.removeItem(LS_NAME_KEY)
        setTestResult(`✓ Connected — ${tickets} ticket${tickets !== 1 ? 's' : ''} in basket`)
      } else {
        localStorage.removeItem(LS_NAME_KEY)
        setTestResult('✗ Cookie rejected — try copying it again')
      }
    } catch {
      setTestResult('✗ Request failed')
    }
    setTesting(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-100">Connect to edfest.com</h2>
            <p className="mt-1 text-sm text-gray-400">
              Paste your session cookie to enable one-click &ldquo;Add to basket&rdquo;.
              Stored only in your browser&rsquo;s localStorage — never sent to our server except to proxy to edfest.com.
            </p>
          </div>
          <button type="button" onClick={onClose} className="ml-4 text-gray-500 hover:text-gray-300">✕</button>
        </div>

        <details className="mb-4 rounded-lg border border-gray-800 bg-gray-950 p-3 text-xs text-gray-400">
          <summary className="cursor-pointer font-medium text-gray-300">How to get your cookie</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>Open <a href="https://edfest.com" target="_blank" rel="noopener noreferrer" className="text-green-400 underline">edfest.com</a> and log in</li>
            <li>Open DevTools: <kbd className="rounded bg-gray-800 px-1">F12</kbd> or <kbd className="rounded bg-gray-800 px-1">Cmd+Option+I</kbd></li>
            <li>Go to the <strong className="text-gray-200">Network</strong> tab</li>
            <li>Reload the page, then click any request to edfest.com</li>
            <li>In the <strong className="text-gray-200">Headers</strong> panel, find the <strong className="text-gray-200">Cookie</strong> request header</li>
            <li>Right-click the value → <strong className="text-gray-200">Copy value</strong> and paste below</li>
          </ol>
          <p className="mt-2 text-amber-400">⚠ Cookies expire. If adding to basket stops working, repeat this process.</p>
        </details>

        <textarea
          value={value}
          onChange={(e) => { setValue(e.target.value); setTestResult(null) }}
          placeholder="Paste cookie string here (access_token=Fe26...)"
          className="h-24 w-full resize-none rounded-lg border border-gray-700 bg-gray-950 p-3 font-mono text-xs text-gray-300 placeholder-gray-600 focus:border-green-400 focus:outline-none"
        />

        {testResult && (
          <p className={`mt-2 text-sm ${testResult.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>
            {testResult}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={test}
            disabled={!value.trim() || testing}
            className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:border-green-400 hover:text-green-400 disabled:opacity-40"
          >
            {testing ? 'Testing…' : 'Test connection'}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!value.trim()}
            className="rounded-lg bg-green-400 px-4 py-2 text-sm font-semibold text-gray-950 hover:bg-green-300 disabled:opacity-40"
          >
            Save
          </button>
          {value && (
            <button
              type="button"
              onClick={clear}
              className="ml-auto rounded-lg border border-red-900/50 px-4 py-2 text-sm text-red-400 hover:border-red-400"
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
