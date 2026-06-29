// ============================================================
// NANANA RADIO 3 — Google Apps Script v4
// Fuente: RSS oficial RTVE + fallback iVoox
// ============================================================

const SHEET_NAME = "Nanana";
const SPREADSHEET_ID = "1xWzlLbOAU03hEWWbkWYvVlBEActjLRrEyk7_MPHE-ZY";
const NOTIFICATION_EMAIL = "";

const RSS_URL = "http://www.rtve.es/api/programas/77850/audios.rss";
const IVOOX_URL = "https://www.ivoox.com/podcast-nanana_sq_f1128042_1.html";

// ============================================================
// PRINCIPAL
// ============================================================
function scrapearNanana() {
  Logger.log("Iniciando scraping...");
  let episodios = [];

  try {
    episodios = scrapeRTVE();
    Logger.log("RTVE: " + episodios.length + " episodios");
  } catch(e) { Logger.log("RTVE error: " + e); }

  if (episodios.length === 0) {
    try {
      episodios = scrapeIvoox();
      Logger.log("iVoox: " + episodios.length + " episodios");
    } catch(e) { Logger.log("iVoox error: " + e); return; }
  }

  if (episodios.length === 0) { Logger.log("Sin episodios."); return; }

  const sheet = obtenerOCrearSheet();

  // Fechas existentes (limpiando comilla inicial para comparar bien)
  const existentes = new Set();
  sheet.getDataRange().getValues().slice(1).forEach(fila => {
    if (fila[0]) existentes.add(String(fila[0]).replace(/^'/, '').trim());
  });

  let nuevas = 0;
  episodios.forEach(ep => {
    if (!existentes.has(ep.fecha)) {
      ep.canciones.forEach(c => {
        sheet.appendRow([
          "'" + ep.fecha,
          c.artista,
          c.titulo,
          c.artista + " - " + c.titulo,
          "NO",
          Utilities.formatDate(new Date(), "Europe/Madrid", "yyyy-MM-dd HH:mm")
        ]);
        nuevas++;
      });
      existentes.add(ep.fecha);
    }
  });

  Logger.log("Canciones nuevas: " + nuevas);

  if (nuevas > 0 && NOTIFICATION_EMAIL) {
    GmailApp.sendEmail(NOTIFICATION_EMAIL, "🎵 Nanana — " + nuevas + " nuevas",
      "Ya puedes ver la playlist en tu app Nanana.");
  }
}

// ============================================================
// RSS RTVE
// ============================================================
function scrapeRTVE() {
  const resp = UrlFetchApp.fetch(RSS_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" },
    muteHttpExceptions: true
  });
  const status = resp.getResponseCode();
  Logger.log("RTVE RSS status: " + status);
  if (status !== 200) throw new Error("status " + status);

  const xml = resp.getContentText();
  const doc = XmlService.parse(xml);
  const channel = doc.getRootElement().getChild('channel');
  const items = channel.getChildren('item');
  const episodios = [];

  items.forEach(item => {
    const desc = item.getChildText('description') || '';
    const pubDate = item.getChildText('pubDate') || '';
    const fecha = parsearFechaRSS(pubDate);
    if (!fecha) return;
    const canciones = extraerCanciones(desc);
    if (canciones.length > 0 && !episodios.find(e => e.fecha === fecha)) {
      episodios.push({ fecha, canciones });
    }
  });

  return episodios;
}

// ============================================================
// IVOOX (fallback)
// ============================================================
function scrapeIvoox() {
  const resp = UrlFetchApp.fetch(IVOOX_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
    muteHttpExceptions: true
  });
  const html = resp.getContentText();
  const bloques = html.split(/Playlist:/i);
  const episodios = [];

  for (let i = 1; i < bloques.length; i++) {
    const fechaMatch = bloques[i-1].match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!fechaMatch) continue;
    const fecha = fechaMatch[3] + "-" + fechaMatch[2] + "-" + fechaMatch[1];
    const canciones = extraerCanciones(bloques[i]);
    if (canciones.length > 0 && !episodios.find(e => e.fecha === fecha)) {
      episodios.push({ fecha, canciones });
    }
  }
  return episodios;
}

// ============================================================
// PARSER DE CANCIONES
// ============================================================
function extraerCanciones(texto) {
  const canciones = [];
  const vistas = new Set();

  const limpio = texto
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, ' ')
    .replace(/&[a-z]+;/g, ' ');

  const lineas = limpio.split(/\n/).map(l => l.trim()).filter(l => l.length > 3);

  const basura = ['playlist','radio','programa','podcast','episodio','escuchar',
                  'descargar','compartir','ivoox','nanana','reproducir','suscrib',
                  'seguir','http','www.','copyright','derechos','rtve'];

  for (const linea of lineas) {
    if (linea.length > 200) continue;
    const low = linea.toLowerCase();
    if (basura.some(b => low.includes(b))) continue;

    const gi = linea.indexOf(' - ');
    if (gi === -1) continue;

    const artista = linea.substring(0, gi).trim();
    const titulo = linea.substring(gi + 3).trim();
    if (artista.length < 2 || titulo.length < 2) continue;
    if (artista.length > 80 || titulo.length > 120) continue;

    const clave = artista.toLowerCase() + '||' + titulo.toLowerCase();
    if (vistas.has(clave)) continue;
    vistas.add(clave);

    canciones.push({ artista, titulo });
    if (canciones.length >= 50) break;
  }

  return canciones;
}

// ============================================================
// FECHA RSS
// ============================================================
function parsearFechaRSS(pubDate) {
  if (!pubDate) return null;
  const meses = {Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
                 Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'};
  const m = pubDate.match(/(\d{1,2})\s+(\w{3})\s+(\d{4})/);
  if (!m) return null;
  return m[3] + '-' + (meses[m[2]] || '01') + '-' + m[1].padStart(2, '0');
}

// ============================================================
// SHEET
// ============================================================
function obtenerOCrearSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(["Fecha","Artista","Título","Búsqueda","Guardada","Añadida el"]);
    sheet.getRange(1,1,1,6).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// ============================================================
// API WEB APP — doGet (lee) / doPost (guarda)
// ============================================================
function doGet(e) {
  const sheet = obtenerOCrearSheet();
  const datos = sheet.getDataRange().getValues();

  const canciones = datos.slice(1)
    .filter(f => f[0] && f[1] && f[2])
    .map(f => {
      let fecha = f[0];
      if (fecha instanceof Date) {
        fecha = Utilities.formatDate(fecha, "Europe/Madrid", "yyyy-MM-dd");
      } else {
        fecha = String(fecha).replace(/^'/, '').trim();
        if (fecha.length > 10) fecha = fecha.substring(0, 10);
      }
      return {
        fecha: fecha,
        a: String(f[1]),
        t: String(f[2]),
        guardada: f[4] === "SI"
      };
    });

  const porFecha = {};
  canciones.forEach(c => {
    if (!c.fecha || c.fecha.length < 8) return;
    if (!porFecha[c.fecha]) porFecha[c.fecha] = [];
    porFecha[c.fecha].push({ a: c.a, t: c.t, guardada: c.guardada });
  });

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, datos: porFecha }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.accion === "guardar") {
      const sheet = obtenerOCrearSheet();
      const filas = sheet.getDataRange().getValues();
      for (let i = 1; i < filas.length; i++) {
        if (String(filas[i][1]) === d.artista && String(filas[i][2]) === d.titulo) {
          sheet.getRange(i+1, 5).setValue(d.guardada ? "SI" : "NO");
          break;
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON);
    }
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ok:false})).setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================
// TRIGGER DIARIO 11H — ejecutar instalarTrigger() una vez
// ============================================================
function instalarTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("scrapearNanana")
    .timeBased().atHour(11).everyDays(1).inTimezone("Europe/Madrid").create();
  Logger.log("✅ Trigger instalado: cada día a las 11h (Madrid).");
}

// ============================================================
// TEST — ejecutar para probar
// ============================================================
function testManual() {
  scrapearNanana();
  Logger.log("Hecho: https://docs.google.com/spreadsheets/d/" + SPREADSHEET_ID);
}
