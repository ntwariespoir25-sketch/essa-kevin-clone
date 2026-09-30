// Opens a server-rendered printable document in a new tab.
//
// The obvious way to do this is window.open('/api/report-cards/x/print'), but a
// plain navigation sends no Authorization header, so the request 401s. The usual
// workaround is to append ?token=<jwt> to the URL, which puts a live session
// token into browser history, server access logs and any Referer header the page
// later sends - and one of the print routes here already did exactly that.
//
// Fetching with the header and rendering the result into a new window keeps the
// token in the Authorization header where it belongs, and still lets the user
// print or save as PDF from the rendered document.

const getToken = () => localStorage.getItem('portalToken');

/**
 * @param {string} path   API path, e.g. /report-cards/:id/print?term=..&year=..
 * @param {string} apiUrl value of VITE_API_URL
 * @param {string} title  document title for the new tab
 * @returns {Promise<boolean>} whether the document was rendered
 */
export const openPrintableDocument = async (path, apiUrl, title = 'Print') => {
  const token = getToken();
  if (!token) throw new Error('You are signed out. Please sign in again to print.');

  // Opened before the first await so the call still counts as a user gesture.
  // After an await, most browsers treat the popup as unsolicited and block it.
  const win = window.open('', '_blank');
  if (!win) throw new Error('Please allow pop-ups to print documents.');

  const showError = (message) => {
    win.document.open();
    win.document.write(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cannot print</title>` +
      `<style>body{font-family:system-ui,sans-serif;padding:40px;color:#333}` +
      `h2{color:#e74c3c}</style></head><body><h2>Cannot open this document</h2>` +
      `<p>${String(message).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</p>` +
      `</body></html>`
    );
    win.document.close();
  };

  try {
    const res = await fetch(`${apiUrl}/api${path}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      let message = `Request failed (${res.status})`;
      const text = await res.text().catch(() => '');
      try {
        const data = JSON.parse(text);
        if (data && data.message) message = data.message;
      } catch {
        // Some error paths answer with HTML rather than JSON; flatten it.
        if (text) {
          const stripped = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          if (stripped) message = stripped.slice(0, 200);
        }
      }
      showError(message);
      throw new Error(message);
    }

    const html = await res.text();

    // Written directly rather than handed over as a blob URL: a blob would have
    // to be revoked at exactly the right moment, and the print view is a
    // self-contained server-rendered page with no scripts of its own.
    win.document.open();
    win.document.write(html);
    win.document.close();
    try {
      win.document.title = title;
    } catch {
      // Cross-origin write can leave the title unset; harmless.
    }
    return true;
  } catch (error) {
    if (!error.message || !/Cannot open/.test(error.message)) showError(error.message || 'Unknown error');
    throw error;
  }
};
