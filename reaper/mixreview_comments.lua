-- Mix Reaview Comments - REAPER Integration Script
-- Requires ReaImGui (install via ReaPack)
-- Connects to Mix Reaview API for comment management
--
-- Usage: Run from REAPER Actions list
-- Dependencies: ReaImGui, json (bundled below)

---------------------------------------------------------------------------
-- Minimal JSON encoder/decoder (pure Lua)
---------------------------------------------------------------------------
local json = {}

local function json_encode_value(val)
  local t = type(val)
  if t == "nil" then return "null"
  elseif t == "boolean" then return val and "true" or "false"
  elseif t == "number" then return tostring(val)
  elseif t == "string" then
    local s = val:gsub('\\', '\\\\'):gsub('"', '\\"'):gsub('\n', '\\n'):gsub('\r', '\\r'):gsub('\t', '\\t')
    return '"' .. s .. '"'
  elseif t == "table" then
    -- detect array vs object
    if #val > 0 or next(val) == nil then
      local parts = {}
      for i = 1, #val do parts[i] = json_encode_value(val[i]) end
      return "[" .. table.concat(parts, ",") .. "]"
    else
      local parts = {}
      for k, v in pairs(val) do
        parts[#parts + 1] = json_encode_value(tostring(k)) .. ":" .. json_encode_value(v)
      end
      return "{" .. table.concat(parts, ",") .. "}"
    end
  end
  return "null"
end
json.encode = json_encode_value

-- Simple JSON decoder
local function json_decode(str)
  if not str or str == "" then return nil end
  -- Use REAPER's built-in JSON if available, otherwise basic parsing
  local pos = 1
  local function skip_ws()
    pos = str:find("[^ \t\r\n]", pos) or (#str + 1)
  end
  local parse_value -- forward declaration

  local function parse_string()
    pos = pos + 1 -- skip opening quote
    local result = {}
    while pos <= #str do
      local c = str:sub(pos, pos)
      if c == '"' then
        pos = pos + 1
        return table.concat(result)
      elseif c == '\\' then
        pos = pos + 1
        local esc = str:sub(pos, pos)
        if esc == 'n' then result[#result + 1] = '\n'
        elseif esc == 't' then result[#result + 1] = '\t'
        elseif esc == 'r' then result[#result + 1] = '\r'
        elseif esc == 'u' then
          -- basic unicode escape: just skip 4 hex digits, output ?
          pos = pos + 4
          result[#result + 1] = '?'
        else result[#result + 1] = esc end
      else
        result[#result + 1] = c
      end
      pos = pos + 1
    end
    return table.concat(result)
  end

  local function parse_number()
    local start = pos
    if str:sub(pos, pos) == '-' then pos = pos + 1 end
    while pos <= #str and str:sub(pos, pos):match("[%d%.eE%+%-]") do pos = pos + 1 end
    return tonumber(str:sub(start, pos - 1))
  end

  local function parse_array()
    pos = pos + 1 -- skip [
    local arr = {}
    skip_ws()
    if str:sub(pos, pos) == ']' then pos = pos + 1; return arr end
    while true do
      skip_ws()
      arr[#arr + 1] = parse_value()
      skip_ws()
      if str:sub(pos, pos) == ',' then pos = pos + 1
      elseif str:sub(pos, pos) == ']' then pos = pos + 1; return arr
      else return arr end
    end
  end

  local function parse_object()
    pos = pos + 1 -- skip {
    local obj = {}
    skip_ws()
    if str:sub(pos, pos) == '}' then pos = pos + 1; return obj end
    while true do
      skip_ws()
      local key = parse_string()
      skip_ws()
      pos = pos + 1 -- skip :
      skip_ws()
      obj[key] = parse_value()
      skip_ws()
      if str:sub(pos, pos) == ',' then pos = pos + 1
      elseif str:sub(pos, pos) == '}' then pos = pos + 1; return obj
      else return obj end
    end
  end

  parse_value = function()
    skip_ws()
    local c = str:sub(pos, pos)
    if c == '"' then return parse_string()
    elseif c == '{' then return parse_object()
    elseif c == '[' then return parse_array()
    elseif c == 't' then pos = pos + 4; return true
    elseif c == 'f' then pos = pos + 5; return false
    elseif c == 'n' then pos = pos + 4; return nil
    else return parse_number() end
  end

  return parse_value()
end
json.decode = json_decode

---------------------------------------------------------------------------
-- HTTP helper (uses curl via os.execute)
---------------------------------------------------------------------------
local function http_request(method, url, body, token)
  local tmp_out = os.tmpname()
  local tmp_err = os.tmpname()
  local cmd = 'curl -s -w "\\n%{http_code}" -X ' .. method
  cmd = cmd .. ' -H "Content-Type: application/json"'
  if token and token ~= "" then
    cmd = cmd .. ' -H "Authorization: Bearer ' .. token .. '"'
  end
  if body then
    local tmp_body = os.tmpname()
    local f = io.open(tmp_body, "w")
    f:write(body)
    f:close()
    cmd = cmd .. ' -d @' .. tmp_body
    cmd = cmd .. ' "' .. url .. '" > ' .. tmp_out .. ' 2>' .. tmp_err
    os.execute(cmd)
    os.remove(tmp_body)
  else
    cmd = cmd .. ' "' .. url .. '" > ' .. tmp_out .. ' 2>' .. tmp_err
    os.execute(cmd)
  end

  local f = io.open(tmp_out, "r")
  local raw = f and f:read("*a") or ""
  if f then f:close() end
  os.remove(tmp_out)
  os.remove(tmp_err)

  -- Last line is HTTP status code
  local lines = {}
  for line in raw:gmatch("[^\n]+") do lines[#lines + 1] = line end
  local status_code = tonumber(lines[#lines]) or 0
  table.remove(lines)
  local response_body = table.concat(lines, "\n")

  return status_code, response_body
end

---------------------------------------------------------------------------
-- State
---------------------------------------------------------------------------
local ctx = reaper.ImGui_CreateContext('Mix Reaview Comments')
local FONT_SIZE = 14

-- Persistent state (saved across sessions via ExtState)
local server_url = reaper.GetExtState("Mix Reaview", "server_url")
local author_name = reaper.GetExtState("Mix Reaview", "author_name")
local username = reaper.GetExtState("Mix Reaview", "username")
local share_link_input = reaper.GetExtState("Mix Reaview", "last_share_link")

if server_url == "" then server_url = "https://mix.stoersender.ch" end
if author_name == "" then author_name = "Frank" end
if username == "" then username = "admin" end

-- Session state
local password = reaper.GetExtState("Mix Reaview", "password")
if password == nil then password = "" end
local remember_password = (password ~= "")
local jwt_token = ""
local logged_in = false
local login_error = ""

local share_link = ""
local project_data = nil
local songs = {}
local selected_song_idx = 0
local selected_version_idx = 0
local comments = {}
local loading = false
local error_msg = ""

-- Calibration: offset per song/version key
local calibration_offsets = {}
local current_offset_key = ""

-- New comment state
local new_comment_text = ""

-- Reply state
local reply_comment_id = nil
local reply_text = ""

-- Filter: 0=all, 1=open, 2=resolved
local filter_mode = 0

---------------------------------------------------------------------------
-- Helpers
---------------------------------------------------------------------------
local function format_timecode(seconds)
  local mins = math.floor(seconds / 60)
  local secs = seconds - mins * 60
  return string.format("%02d:%05.2f", mins, secs)
end

local function get_offset_key()
  if selected_song_idx > 0 then
    local song = songs[selected_song_idx]
    if song then return tostring(song.id) end
  end
  return ""
end

local function get_current_offset()
  local key = get_offset_key()
  return calibration_offsets[key] or 0
end

local function save_state()
  reaper.SetExtState("Mix Reaview", "server_url", server_url, true)
  reaper.SetExtState("Mix Reaview", "author_name", author_name, true)
  reaper.SetExtState("Mix Reaview", "username", username, true)
  reaper.SetExtState("Mix Reaview", "last_share_link", share_link_input, true)
  if remember_password then
    reaper.SetExtState("Mix Reaview", "password", password, true)
  else
    reaper.DeleteExtState("Mix Reaview", "password", true)
  end
end

---------------------------------------------------------------------------
-- API functions
---------------------------------------------------------------------------
local function api_login()
  login_error = ""
  local url = server_url .. "/admin/auth/login"
  local body = json.encode({username = username, password = password})
  local status, resp = http_request("POST", url, body)
  if status == 200 then
    local data = json.decode(resp)
    if data and data.access_token then
      jwt_token = data.access_token
      logged_in = true
      save_state()
    else
      login_error = "Invalid response"
    end
  else
    login_error = "Login failed (HTTP " .. tostring(status) .. ")"
  end
end

local function extract_share_code(input)
  -- Accept full URL or just the code
  -- e.g. "https://mix.stoersender.ch/fb162cbea433" -> "fb162cbea433"
  local code = input:match("[/]([%w]+)$")
  if code then return code end
  return input
end

local function api_load_project()
  error_msg = ""
  loading = true
  share_link_input = extract_share_code(share_link_input)
  local url = server_url .. "/api/projects/" .. share_link_input
  local status, resp = http_request("GET", url)
  if status == 200 then
    project_data = json.decode(resp)
    songs = project_data and project_data.songs or {}
    selected_song_idx = #songs > 0 and 1 or 0
    selected_version_idx = 0
    if selected_song_idx > 0 and songs[selected_song_idx].versions then
      selected_version_idx = #songs[selected_song_idx].versions > 0 and #songs[selected_song_idx].versions or 0
    end
    share_link = share_link_input
    comments = {}
    save_state()
  else
    error_msg = "Failed to load project (HTTP " .. tostring(status) .. ")"
    project_data = nil
    songs = {}
  end
  loading = false
end

local function api_load_comments()
  if share_link == "" then return end
  local song = songs[selected_song_idx]
  local ver = song and song.versions and song.versions[selected_version_idx]
  if not ver then comments = {}; return end

  local url = server_url .. "/api/projects/" .. share_link .. "/comments?version_id=" .. tostring(ver.id)
  local status, resp = http_request("GET", url)
  if status == 200 then
    comments = json.decode(resp) or {}
  else
    error_msg = "Failed to load comments"
    comments = {}
  end
end

local function api_create_comment(timecode, text)
  local song = songs[selected_song_idx]
  local ver = song and song.versions and song.versions[selected_version_idx]
  if not ver then return end

  local url = server_url .. "/api/projects/" .. share_link .. "/comments"
  local body = json.encode({
    version_id = ver.id,
    timecode = timecode,
    author_name = author_name,
    text = text,
  })
  local status, resp = http_request("POST", url, body)
  if status == 201 then
    api_load_comments()
  else
    error_msg = "Failed to create comment (HTTP " .. tostring(status) .. ")"
  end
end

local function api_reply(comment_id, text)
  local url = server_url .. "/api/projects/" .. share_link .. "/comments/" .. tostring(comment_id) .. "/reply"
  local body = json.encode({
    author_name = author_name,
    text = text,
  })
  local status, resp = http_request("POST", url, body)
  if status == 201 then
    api_load_comments()
  else
    error_msg = "Failed to reply (HTTP " .. tostring(status) .. ")"
  end
end

local function api_resolve(comment_id)
  -- Use admin endpoint with JWT
  local url = server_url .. "/api/projects/" .. share_link .. "/comments/" .. tostring(comment_id) .. "/resolve"
  local status, resp = http_request("PATCH", url, nil, jwt_token)
  if status == 200 then
    api_load_comments()
  else
    error_msg = "Failed to resolve (HTTP " .. tostring(status) .. ")"
  end
end

---------------------------------------------------------------------------
-- Colors
---------------------------------------------------------------------------
local COL_GREEN     = 0x44CC44FF
local COL_ORANGE    = 0xFFAA00FF
local COL_RED       = 0xFF4444FF
local COL_BLUE      = 0x88BBFFFF
local COL_DIMMED    = 0x888888FF
local COL_ACCENT    = 0x6C8CFFFF
local COL_BG_OPEN   = 0x1A2A4A80
local COL_BG_SOLVED = 0x1A3A1A40

---------------------------------------------------------------------------
-- UI
---------------------------------------------------------------------------
local function draw_login_section()
  if logged_in then
    -- Compact: one line when logged in
    reaper.ImGui_TextColored(ctx, COL_GREEN, ">> " .. username)
    reaper.ImGui_SameLine(ctx)
    if reaper.ImGui_SmallButton(ctx, "Logout") then
      logged_in = false
      jwt_token = ""
      if not remember_password then password = "" end
    end
    reaper.ImGui_SameLine(ctx)
    reaper.ImGui_TextColored(ctx, COL_DIMMED, "| " .. server_url)
    return
  end

  if reaper.ImGui_TreeNode(ctx, "Login", reaper.ImGui_TreeNodeFlags_DefaultOpen()) then
    reaper.ImGui_Text(ctx, "Server:")
    reaper.ImGui_SameLine(ctx, 70)
    local changed
    reaper.ImGui_SetNextItemWidth(ctx, -1)
    changed, server_url = reaper.ImGui_InputText(ctx, "##server_url", server_url)

    reaper.ImGui_Text(ctx, "User:")
    reaper.ImGui_SameLine(ctx, 70)
    reaper.ImGui_SetNextItemWidth(ctx, -1)
    changed, username = reaper.ImGui_InputText(ctx, "##username", username)

    reaper.ImGui_Text(ctx, "Password:")
    reaper.ImGui_SameLine(ctx, 70)
    reaper.ImGui_SetNextItemWidth(ctx, -1)
    changed, password = reaper.ImGui_InputText(ctx, "##password", password, reaper.ImGui_InputTextFlags_Password())

    local rem_changed
    rem_changed, remember_password = reaper.ImGui_Checkbox(ctx, "Remember me", remember_password)
    if rem_changed then save_state() end
    reaper.ImGui_SameLine(ctx)
    if reaper.ImGui_Button(ctx, "Login##login_btn") then
      api_login()
    end

    if login_error ~= "" then
      reaper.ImGui_TextColored(ctx, COL_RED, login_error)
    end
    reaper.ImGui_TreePop(ctx)
  end
end

local function draw_project_section()
  -- Compact: share link + load on one line
  reaper.ImGui_SetNextItemWidth(ctx, -50)
  local changed
  changed, share_link_input = reaper.ImGui_InputText(ctx, "##share_link", share_link_input)
  reaper.ImGui_SameLine(ctx)
  if reaper.ImGui_Button(ctx, "Load##load_btn") then
    api_load_project()
  end

  if project_data then
    reaper.ImGui_TextColored(ctx, COL_ACCENT, project_data.title or "")
  end

  if error_msg ~= "" then
    reaper.ImGui_TextColored(ctx, COL_RED, error_msg)
  end
end

local function draw_song_version_section()
  if not project_data or #songs == 0 then return end

  -- Song and version on same line with calibration
  local current_song = songs[selected_song_idx]
  local song_label = current_song and current_song.title or "Select..."

  local avail_w = reaper.ImGui_GetContentRegionAvail(ctx)
  reaper.ImGui_SetNextItemWidth(ctx, avail_w * 0.55)
  if reaper.ImGui_BeginCombo(ctx, "##song", song_label) then
    for i, song in ipairs(songs) do
      if reaper.ImGui_Selectable(ctx, song.title, i == selected_song_idx) then
        selected_song_idx = i
        local versions = songs[i].versions or {}
        selected_version_idx = #versions > 0 and #versions or 0
        api_load_comments()
      end
    end
    reaper.ImGui_EndCombo(ctx)
  end

  reaper.ImGui_SameLine(ctx)

  local versions = current_song and current_song.versions or {}
  local current_ver = versions[selected_version_idx]
  local ver_label = current_ver and ("v" .. tostring(current_ver.version_number)) or "v?"
  reaper.ImGui_SetNextItemWidth(ctx, -1)
  if reaper.ImGui_BeginCombo(ctx, "##version", ver_label) then
    for i, ver in ipairs(versions) do
      local label = "v" .. tostring(ver.version_number)
      if ver.label and ver.label ~= "" then label = label .. " - " .. ver.label end
      if reaper.ImGui_Selectable(ctx, label, i == selected_version_idx) then
        selected_version_idx = i
        api_load_comments()
      end
    end
    reaper.ImGui_EndCombo(ctx)
  end

  -- Calibration inline
  local offset = get_current_offset()
  reaper.ImGui_TextColored(ctx, COL_DIMMED, "Offset: " .. format_timecode(offset))
  reaper.ImGui_SameLine(ctx)
  if reaper.ImGui_SmallButton(ctx, "Set from Cursor") then
    local key = get_offset_key()
    if key ~= "" then
      calibration_offsets[key] = reaper.GetCursorPosition()
      reaper.SetExtState("Mix Reaview", "offset_" .. key, tostring(calibration_offsets[key]), true)
    end
  end
  if offset == 0 then
    reaper.ImGui_SameLine(ctx)
    reaper.ImGui_TextColored(ctx, COL_ORANGE, "(!)")
  end
end

local function draw_new_comment_section()
  if share_link == "" or selected_version_idx == 0 then return end

  reaper.ImGui_Separator(ctx)

  -- Compact: author + timecode on one line
  reaper.ImGui_SetNextItemWidth(ctx, 120)
  local changed
  changed, author_name = reaper.ImGui_InputText(ctx, "##author", author_name)
  reaper.ImGui_SameLine(ctx)

  local cursor_pos = reaper.GetCursorPosition()
  local offset = get_current_offset()
  local relative_tc = math.max(0, cursor_pos - offset)
  reaper.ImGui_TextColored(ctx, COL_BLUE, "@" .. format_timecode(relative_tc))

  -- Comment input + button on one row
  reaper.ImGui_SetNextItemWidth(ctx, -80)
  changed, new_comment_text = reaper.ImGui_InputText(ctx, "##new_comment", new_comment_text)
  reaper.ImGui_SameLine(ctx)
  if reaper.ImGui_Button(ctx, "Add##add_btn", 70, 0) and new_comment_text ~= "" then
    api_create_comment(relative_tc, new_comment_text)
    new_comment_text = ""
  end
end

local function draw_comments_section()
  if share_link == "" then return end

  reaper.ImGui_Separator(ctx)

  -- Count open/resolved
  local open_count, resolved_count = 0, 0
  for _, c in ipairs(comments) do
    if c.solved then resolved_count = resolved_count + 1 else open_count = open_count + 1 end
  end

  -- Filter + refresh compact
  if reaper.ImGui_RadioButton(ctx, "All (" .. #comments .. ")", filter_mode == 0) then filter_mode = 0 end
  reaper.ImGui_SameLine(ctx)
  if reaper.ImGui_RadioButton(ctx, "Open (" .. open_count .. ")", filter_mode == 1) then filter_mode = 1 end
  reaper.ImGui_SameLine(ctx)
  if reaper.ImGui_RadioButton(ctx, "Done (" .. resolved_count .. ")", filter_mode == 2) then filter_mode = 2 end
  reaper.ImGui_SameLine(ctx)
  if reaper.ImGui_SmallButton(ctx, "Refresh") then
    api_load_comments()
  end

  -- Scrollable comment list (0 height = use remaining space)
  if reaper.ImGui_BeginChild(ctx, "##comments_scroll", 0, 0, 0) then

    local offset = get_current_offset()
    for _, c in ipairs(comments) do
      local show = (filter_mode == 0)
        or (filter_mode == 1 and not c.solved)
        or (filter_mode == 2 and c.solved)

      if show then
        reaper.ImGui_PushID(ctx, c.id)

        -- Timecode button (clickable = jump)
        if c.solved then
          reaper.ImGui_PushStyleColor(ctx, reaper.ImGui_Col_Text(), COL_DIMMED)
        end

        if reaper.ImGui_SmallButton(ctx, "@" .. format_timecode(c.timecode)) then
          local target = offset + c.timecode
          reaper.SetEditCurPos(target, true, true)
          local state = reaper.GetPlayState()
          if state == 0 then reaper.OnPlayButton() end
        end
        reaper.ImGui_SameLine(ctx)
        reaper.ImGui_Text(ctx, (c.author_name or ""))
        reaper.ImGui_SameLine(ctx)
        if c.solved then
          reaper.ImGui_TextColored(ctx, COL_GREEN, "Done")
        else
          reaper.ImGui_TextColored(ctx, COL_ORANGE, "Open")
        end

        -- Comment text
        if c.solved then
          reaper.ImGui_TextColored(ctx, COL_DIMMED, c.text or "")
        else
          reaper.ImGui_TextWrapped(ctx, c.text or "")
        end

        if c.solved then
          reaper.ImGui_PopStyleColor(ctx)
        end

        -- Action buttons (compact)
        if reaper.ImGui_SmallButton(ctx, "Reply") then
          if reply_comment_id == c.id then
            reply_comment_id = nil
          else
            reply_comment_id = c.id
            reply_text = ""
          end
        end
        if logged_in then
          reaper.ImGui_SameLine(ctx)
          local resolve_label = c.solved and "Reopen" or "Resolve"
          if reaper.ImGui_SmallButton(ctx, resolve_label) then
            api_resolve(c.id)
          end
        end

        -- Reply input (inline)
        if reply_comment_id == c.id then
          reaper.ImGui_Indent(ctx, 16)
          reaper.ImGui_SetNextItemWidth(ctx, -60)
          local rchanged
          rchanged, reply_text = reaper.ImGui_InputText(ctx, "##reply_input", reply_text)
          reaper.ImGui_SameLine(ctx)
          if reaper.ImGui_SmallButton(ctx, "Send") and reply_text ~= "" then
            api_reply(c.id, reply_text)
            reply_comment_id = nil
            reply_text = ""
          end
          reaper.ImGui_Unindent(ctx, 16)
        end

        -- Existing replies
        if c.replies and #c.replies > 0 then
          reaper.ImGui_Indent(ctx, 16)
          for _, r in ipairs(c.replies) do
            reaper.ImGui_TextColored(ctx, COL_DIMMED, (r.author_name or "") .. ":")
            reaper.ImGui_SameLine(ctx)
            reaper.ImGui_TextWrapped(ctx, r.text or "")
          end
          reaper.ImGui_Unindent(ctx, 16)
        end

        reaper.ImGui_PopID(ctx)
        reaper.ImGui_Spacing(ctx)
        reaper.ImGui_Separator(ctx)
        reaper.ImGui_Spacing(ctx)
      end
    end

    reaper.ImGui_EndChild(ctx)
  end
end

---------------------------------------------------------------------------
-- Main loop
---------------------------------------------------------------------------
local function loop()
  reaper.ImGui_SetNextWindowSize(ctx, 420, 700, reaper.ImGui_Cond_FirstUseEver())
  local visible, open = reaper.ImGui_Begin(ctx, 'Mix Reaview Comments', true)

  if visible then
    draw_login_section()
    draw_project_section()
    draw_song_version_section()
    draw_new_comment_section()
    draw_comments_section()
    reaper.ImGui_End(ctx)
  end

  if open then
    reaper.defer(loop)
  end
end

-- Load saved calibration offsets (per song)
for _, song in ipairs(songs) do
  local key = tostring(song.id)
  local saved = reaper.GetExtState("Mix Reaview", "offset_" .. key)
  if saved ~= "" then calibration_offsets[key] = tonumber(saved) end
end

reaper.defer(loop)
