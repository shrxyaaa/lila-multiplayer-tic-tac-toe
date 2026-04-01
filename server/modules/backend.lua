--[[
  RPCs + matchmaker hook + leaderboard bootstrap for Tic-Tac-Toe.
]]

local nk = require("nakama")

local LEADERBOARD_ID = "tictactoe_wins"

local function decode_payload(payload)
  local decoded = {}
  if payload and payload ~= "" then
    local ok, data = pcall(nk.json_decode, payload)
    if ok and data then
      decoded = data
    end
  end
  return decoded
end

local function trim(value)
  local s = tostring(value or "")
  s = string.gsub(s, "^%s+", "")
  s = string.gsub(s, "%s+$", "")
  return s
end

local function normalize_mode(mode)
  if mode == "timed" then
    return "timed"
  end
  return "classic"
end

local function normalize_visibility(visibility)
  if visibility == "private" then
    return "private"
  end
  if visibility == "matchmaking" then
    return "matchmaking"
  end
  return "public"
end

local function ensure_leaderboard()
  local ok, err = pcall(function()
    nk.leaderboard_create(LEADERBOARD_ID, true, "desc", "set", nil, {
      description = "Tic-tac-toe ranked wins (with streak as subscore metadata)",
    }, true)
  end)
  if not ok and err then
    nk.logger_info("leaderboard_create: %s", tostring(err))
  end
end

ensure_leaderboard()

local function create_room_from_payload(decoded)
  local mode = normalize_mode(decoded.game_mode)
  local visibility = normalize_visibility(decoded.visibility or decoded.room_type)
  local match_id = nk.match_create("tictactoe", {
    game_mode = mode,
    room_type = visibility,
  })
  return nk.json_encode({
    match_id = match_id,
    game_mode = mode,
    visibility = visibility,
  })
end

local function create_room(ctx, payload)
  local decoded = decode_payload(payload)
  return create_room_from_payload(decoded)
end

local function create_private_match(ctx, payload)
  local decoded = decode_payload(payload)
  decoded.visibility = "private"
  return create_room_from_payload(decoded)
end

local function list_open_matches(ctx, payload)
  local decoded = decode_payload(payload)
  local limit = tonumber(decoded.limit) or 12
  limit = math.max(1, math.min(limit, 24))

  local mode = decoded.game_mode
  if mode ~= nil and mode ~= "" then
    mode = normalize_mode(mode)
  else
    mode = nil
  end

  local query = "+label.room_type:public +label.open:T"
  if mode then
    query = query .. " +label.game_mode:" .. mode
  end

  local matches = nk.match_list(limit, true, "", 0, 1, query)
  local results = {}

  for _, match in ipairs(matches) do
    local label = {}
    if match.label and match.label ~= "" then
      local ok, parsed = pcall(nk.json_decode, match.label)
      if ok and parsed then
        label = parsed
      end
    end

    table.insert(results, {
      match_id = match.match_id,
      game_mode = label.game_mode or "classic",
      player_count = label.player_count or match.size or 0,
      required_player_count = label.required_player_count or 2,
      status = label.status or "waiting",
    })
  end

  return nk.json_encode({ matches = results })
end

local function resolve_login_identifier(ctx, payload)
  local decoded = decode_payload(payload)
  local identifier = trim(decoded.identifier)
  if identifier == "" then
    return nk.json_encode({ error = "missing_identifier" })
  end

  local lowered = string.lower(identifier)
  if string.find(lowered, "@", 1, true) then
    return nk.json_encode({ email = lowered })
  end

  local rows = nk.sql_query(
    "SELECT email FROM nakama.public.users WHERE lower(username) = lower($1) LIMIT 1",
    { identifier }
  )

  if #rows == 0 or rows[1].email == nil or rows[1].email == "" then
    return nk.json_encode({ error = "account_not_found" })
  end

  return nk.json_encode({ email = string.lower(rows[1].email) })
end

local function check_signup_availability(ctx, payload)
  local decoded = decode_payload(payload)
  local email = string.lower(trim(decoded.email))
  local username = trim(decoded.username)

  if email == "" or username == "" then
    return nk.json_encode({ error = "missing_fields" })
  end

  local email_rows = nk.sql_query(
    "SELECT id FROM nakama.public.users WHERE lower(email) = lower($1) LIMIT 1",
    { email }
  )
  local username_rows = nk.sql_query(
    "SELECT id FROM nakama.public.users WHERE lower(username) = lower($1) LIMIT 1",
    { username }
  )

  return nk.json_encode({
    email_exists = #email_rows > 0,
    username_exists = #username_rows > 0,
  })
end

local function extract_mode(user)
  if user.string_properties and user.string_properties.game_mode then
    return user.string_properties.game_mode
  end
  if user.properties and user.properties.game_mode then
    return user.properties.game_mode
  end
  return "classic"
end

local function matchmaker_matched(context, matched_users)
  if #matched_users ~= 2 then
    nk.logger_info("matchmaker_matched: expected 2 users, got %d", #matched_users)
    return nil
  end
  local m1 = extract_mode(matched_users[1])
  local m2 = extract_mode(matched_users[2])
  local mode = m1
  if m1 ~= m2 then
    nk.logger_info("matchmaker_matched: mode mismatch %s vs %s, defaulting to classic", m1, m2)
    mode = "classic"
  end
  if mode ~= "timed" then
    mode = "classic"
  end

  return nk.match_create("tictactoe", {
    game_mode = mode,
    room_type = "matchmaking",
  })
end

nk.register_rpc(create_room, "create_room")
nk.register_rpc(create_private_match, "create_private_match")
nk.register_rpc(list_open_matches, "list_open_matches")
nk.register_rpc(resolve_login_identifier, "resolve_login_identifier")
nk.register_rpc(check_signup_availability, "check_signup_availability")
nk.register_matchmaker_matched(matchmaker_matched)
