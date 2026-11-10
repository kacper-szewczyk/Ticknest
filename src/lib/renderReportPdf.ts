// Loaded on demand when someone exports a PDF, so jsPDF and the fonts stay out of the initial bundle.
import { jsPDF } from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import interRegularUrl from '@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf?url'
import interSemiBoldUrl from '@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf?url'
import type { ReportPdfModel } from './reportPdf'

const FONT = 'Inter'
const MARGIN = 40
const TEXT = '#1f2933'
const MUTED = '#616e7c'
const HEAD_FILL = '#eef2f0'
const LINE = '#d9e0dc'

type DocWithTable = jsPDF & { lastAutoTable?: { finalY: number } }

function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return btoa(binary)
}

async function loadFont(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Could not load the PDF font. Check your connection and try again.')
  return toBase64(await response.arrayBuffer())
}

// The built-in PDF fonts only cover Western European characters; Inter also covers names like "Łucja Wójcik".
async function registerFonts(doc: jsPDF) {
  const [regular, semiBold] = await Promise.all([loadFont(interRegularUrl), loadFont(interSemiBoldUrl)])
  doc.addFileToVFS('Inter-Regular.ttf', regular)
  doc.addFont('Inter-Regular.ttf', FONT, 'normal')
  doc.addFileToVFS('Inter-SemiBold.ttf', semiBold)
  doc.addFont('Inter-SemiBold.ttf', FONT, 'bold')
  doc.setFont(FONT, 'normal')
}

function lastY(doc: DocWithTable, fallback: number) {
  return doc.lastAutoTable?.finalY ?? fallback
}

function sectionTitle(doc: jsPDF, text: string, y: number) {
  doc.setFont(FONT, 'bold')
  doc.setFontSize(12)
  doc.setTextColor(TEXT)
  doc.text(text, MARGIN, y)
}

const tableStyles = {
  styles: { font: FONT, fontSize: 8, textColor: TEXT, cellPadding: 4, lineColor: LINE, lineWidth: 0.5 },
  headStyles: { font: FONT, fontStyle: 'bold' as const, fillColor: HEAD_FILL, textColor: TEXT },
  // The bottom margin leaves room for the page footer.
  margin: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: MARGIN + 10 },
}

export async function renderReportPdf(model: ReportPdfModel): Promise<Blob> {
  const doc: DocWithTable = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  await registerFonts(doc)
  doc.setProperties({ title: `${model.title} – ${model.subtitle}`, creator: 'Ticknest' })

  doc.setFont(FONT, 'bold')
  doc.setFontSize(18)
  doc.setTextColor(TEXT)
  doc.text(model.title, MARGIN, MARGIN + 8)
  doc.setFont(FONT, 'normal')
  doc.setFontSize(11)
  doc.text(model.subtitle, MARGIN, MARGIN + 28)
  doc.setFontSize(8.5)
  doc.setTextColor(MUTED)
  const pageWidth = doc.internal.pageSize.getWidth()
  let y = MARGIN + 46
  for (const line of model.details) {
    for (const wrapped of doc.splitTextToSize(line, pageWidth - MARGIN * 2) as string[]) {
      doc.text(wrapped, MARGIN, y)
      y += 12
    }
  }

  autoTable(doc, {
    ...tableStyles,
    startY: y + 4,
    head: [model.totals.map(([label]) => label)],
    body: [model.totals.map(([, value]) => value)],
    styles: { ...tableStyles.styles, fontSize: 10, halign: 'left' },
    bodyStyles: { font: FONT, fontStyle: 'bold' },
  })

  sectionTitle(doc, model.summaryTitle, lastY(doc, y) + 24)
  autoTable(doc, {
    ...tableStyles,
    startY: lastY(doc, y) + 32,
    head: [model.summaryHead],
    body: model.summaryBody.length > 0 ? model.summaryBody.map((row) => row.cells) : [['No entries', '', '', '', '']],
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    didParseCell: (data) => {
      if (data.section !== 'body') return
      const row = model.summaryBody[data.row.index]
      if (!row) return
      if (row.nested) {
        data.cell.styles.textColor = MUTED
        if (data.column.index === 0) data.cell.styles.cellPadding = { top: 4, right: 4, bottom: 4, left: 18 }
      } else {
        data.cell.styles.fontStyle = 'bold'
      }
    },
  })

  sectionTitle(doc, 'Detailed entries (newest first)', lastY(doc, y) + 24)
  const durationColumn = model.entriesHead.indexOf('Duration')
  autoTable(doc, {
    ...tableStyles,
    startY: lastY(doc, y) + 32,
    head: [model.entriesHead],
    body: model.entriesBody.length > 0 ? model.entriesBody : [['No entries']],
    columnStyles: { [durationColumn]: { halign: 'right', fontStyle: 'bold' } },
    showHead: 'everyPage',
  })

  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page)
    doc.setFont(FONT, 'normal')
    doc.setFontSize(8)
    doc.setTextColor(MUTED)
    const pageHeight = doc.internal.pageSize.getHeight()
    doc.text(`${model.title} · ${model.subtitle}`, MARGIN, pageHeight - 20)
    doc.text(`Page ${page} of ${pages}`, pageWidth - MARGIN, pageHeight - 20, { align: 'right' })
  }

  return doc.output('blob')
}
