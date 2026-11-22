// Roda no Electron do projeto: abre cada modelo HTML (com as imagens trocadas) numa janela
// escondida do tamanho dele e grava o print. Chamado por scripts/prints-readme-compose.mjs.
// Argumentos: um JSON com [{ html, out, width, height, images: { NOME: caminho } }].
const { app, BrowserWindow } = require('electron')
const { readFileSync, writeFileSync, mkdtempSync, rmSync } = require('fs')
const { join } = require('path')
const { tmpdir } = require('os')
const { pathToFileURL } = require('url')

const jobs = JSON.parse(process.argv[process.argv.length - 1])
app.disableHardwareAcceleration()
// Uma janela por vez: fechar uma não pode fechar o app.
app.on('window-all-closed', () => {})
app
  .whenReady()
  .then(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wisp-compose-'))
    for (const [i, job] of jobs.entries()) {
      let html = readFileSync(job.html, 'utf8')
      for (const [name, file] of Object.entries(job.images))
        html = html.split(`"${name}"`).join(`"${pathToFileURL(file).href}"`)
      const page = join(dir, `page-${i}.html`)
      writeFileSync(page, html)
      const win = new BrowserWindow({
        width: job.width,
        height: job.height,
        show: false,
        useContentSize: true,
        enableLargerThanScreen: true,
        webPreferences: { offscreen: true }
      })
      await win.loadFile(page)
      await win.webContents.executeJavaScript(
        `Promise.all([document.fonts.ready, ...[...document.images].map((img) => img.decode())])`
      )
      await new Promise((resolve) => setTimeout(resolve, 300))
      const image = await win.webContents.capturePage({
        x: 0,
        y: 0,
        width: job.width,
        height: job.height
      })
      writeFileSync(job.out, image.toPNG())
      console.log(job.out.split('/').pop(), JSON.stringify(image.getSize()))
      win.destroy()
    }
    rmSync(dir, { recursive: true, force: true })
    app.quit()
  })
  .catch((err) => {
    console.error(err)
    app.exit(1)
  })
