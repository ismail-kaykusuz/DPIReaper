const SETUP_PAGE_HTML: &str = include_str!("../assets/setup_page.html");
const SETUP_I18N_JSON: &str = include_str!("../assets/setup_i18n.json");

pub fn normalize_lang(raw: &str) -> &'static str {
    match raw.trim().to_lowercase().as_str() {
        "tr" => "tr",
        "de" => "de",
        "fr" => "fr",
        "es" => "es",
        "it" => "it",
        "pt" => "pt",
        "ru" => "ru",
        "ar" => "ar",
        "zh" => "zh",
        "ja" => "ja",
        "ko" => "ko",
        _ => "en",
    }
}

pub fn parse_lang_from_path(raw_path: &str) -> (&str, &'static str) {
    let path_only = raw_path.split('?').next().unwrap_or("/");
    let query = raw_path.split('?').nth(1).unwrap_or("");
    let lang = query
        .split('&')
        .find_map(|pair| {
            let mut parts = pair.splitn(2, '=');
            let key = parts.next()?;
            if key == "lang" {
                Some(normalize_lang(parts.next().unwrap_or("en")))
            } else {
                None
            }
        })
        .unwrap_or("en");
    (path_only, lang)
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn host_from_pac_url(pac_url: &str) -> String {
    let without_scheme = pac_url
        .trim_start_matches("http://")
        .trim_start_matches("https://");
    without_scheme
        .split('/')
        .next()
        .unwrap_or("127.0.0.1")
        .split(':')
        .next()
        .unwrap_or("127.0.0.1")
        .to_string()
}

pub fn make_setup_html(pac_url: &str, proxy_port: u16, lang: &str) -> String {
    let lang = normalize_lang(lang);
    let host = host_from_pac_url(pac_url);
    SETUP_PAGE_HTML
        .replace("{{PAC_URL}}", &html_escape(pac_url))
        .replace("{{PROXY_HOST}}", &html_escape(&host))
        .replace("{{PROXY_PORT}}", &proxy_port.to_string())
        .replace("{{LANG}}", lang)
        .replace("{{I18N_JSON}}", SETUP_I18N_JSON)
}
