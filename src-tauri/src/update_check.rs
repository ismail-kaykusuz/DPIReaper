use serde::Serialize;

#[derive(Serialize)]
pub struct UpdateInfo {
    pub latest: String,
    pub url: String,
    pub update_available: bool,
}

fn parse_tag(raw: &str) -> String {
    raw.trim().trim_start_matches('v').trim_start_matches('V').to_string()
}

fn compare_semver(a: &str, b: &str) -> i32 {
    let pa: Vec<u32> = a.split('.').map(|p| p.parse().unwrap_or(0)).collect();
    let pb: Vec<u32> = b.split('.').map(|p| p.parse().unwrap_or(0)).collect();
    let len = pa.len().max(pb.len());
    for i in 0..len {
        let da = *pa.get(i).unwrap_or(&0);
        let db = *pb.get(i).unwrap_or(&0);
        if da > db {
            return 1;
        }
        if da < db {
            return -1;
        }
    }
    0
}

#[tauri::command]
pub fn check_for_app_update(current_version: String) -> Result<UpdateInfo, String> {
    let agent = format!("DPIReaper/{}", current_version);
    let resp = ureq::get("https://api.github.com/repos/ismail-kaykusuz/DPIReaper/releases/latest")
        .set("User-Agent", &agent)
        .set("Accept", "application/vnd.github+json")
        .set("X-GitHub-Api-Version", "2022-11-28")
        .call()
        .map_err(|e| format!("GitHub API: {}", e))?;

    let json: serde_json::Value = resp
        .into_json()
        .map_err(|e| format!("JSON parse: {}", e))?;

    let latest = json
        .get("tag_name")
        .and_then(|v| v.as_str())
        .map(parse_tag)
        .unwrap_or_default();

    let url = json
        .get("html_url")
        .and_then(|v| v.as_str())
        .unwrap_or("https://github.com/ismail-kaykusuz/DPIReaper/releases/latest")
        .to_string();

    let update_available = !latest.is_empty() && compare_semver(&latest, &current_version) > 0;

    Ok(UpdateInfo {
        latest,
        url,
        update_available,
    })
}
