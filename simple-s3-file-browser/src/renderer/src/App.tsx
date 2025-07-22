import Versions from './components/Versions'
import electronLogo from './assets/electron.svg'

function App(): React.JSX.Element {
  const ipcHandle = (): void => window.electron.ipcRenderer.send('ping')

  return (
    <>
      <img alt="logo" className="mx-auto w-24 h-24" src={electronLogo} />
      <div className="creator">Powered by electron-vite</div>
      <div className="text-2xl text-center text-amber-600">Simple S3 File Browser</div>
      <div className="text">
        Build an Electron app with <span className="react">React</span>
        &nbsp;and <span className="ts">TypeScript</span>
      </div>
      <p className="text-2xl text-gray-500 mt-6">
        Please try pressing <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">F12</code> to
        open the devTool
      </p>

      <div className="actions">
        <div className="action">
          <a href="https://electron-vite.org/" target="_blank" rel="noreferrer">
            Documentation
          </a>
        </div>
        <div className="action">
          <a target="_blank" rel="noreferrer" onClick={ipcHandle}>
            Send IPC
          </a>
        </div>
      </div>

      <div className="flex justify-center gap-4 mt-8">
        <a
          href="https://electron-vite.org/"
          target="_blank"
          rel="noreferrer"
          className="px-4 py-2 text-blue-600 hover:text-blue-800 underline"
        >
          Documentation
        </a>
        <button
          onClick={ipcHandle}
          className="px-4 py-2 text-purple-600 hover:text-purple-800 underline cursor-pointer"
        >
          Send IPC
        </button>
      </div>

      <Versions></Versions>
    </>
  )
}

export default App
