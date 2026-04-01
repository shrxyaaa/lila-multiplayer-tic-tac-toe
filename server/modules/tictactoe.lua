--[[
  Authoritative Tic-Tac-Toe match. Clients send move intents (op 1); server validates and broadcasts state (op 2).
]]

local nk = require("nakama")

local LEADERBOARD_ID = "tictactoe_wins"
local OP_MOVE = 1
local OP_STATE = 2
local TURN_SECONDS = 30
local JOIN_RESERVE_TICKS = 25

local lines = {
  { 1, 2, 3 }, { 4, 5, 6 }, { 7, 8, 9 },
  { 1, 4, 7 }, { 2, 5, 8 }, { 3, 6, 9 },
  { 1, 5, 9 }, { 3, 5, 7 },
}

local function build_label(state)
  return nk.json_encode({
    open =
      state.room_type == "public" and
      state.status == "waiting" and
      state.seats > 0 and
      state.seats < state.required_player_count,
    game_mode = state.game_mode,
    room_type = state.room_type,
    player_count = state.seats,
    required_player_count = state.required_player_count,
    status = state.status,
  })
end

local function update_label(dispatcher, state)
  dispatcher.match_label_update(build_label(state))
end

local function board_full(board)
  for i = 1, 9 do
    if board[i] == 0 then
      return false
    end
  end
  return true
end

local function check_winner(board)
  for _, l in ipairs(lines) do
    local a, b, c = l[1], l[2], l[3]
    local v = board[a]
    if v ~= 0 and v == board[b] and v == board[c] then
      return v
    end
  end
  return 0
end

local function read_stats(user_id)
  local res = nk.storage_read({
    { collection = "tictactoe", key = "stats", user_id = user_id },
  })
  if #res > 0 and res[1].value then
    return res[1].value
  end
  return { wins = 0, losses = 0, streak = 0 }
end

local function write_stats(user_id, stats)
  nk.storage_write({
    {
      collection = "tictactoe",
      key = "stats",
      user_id = user_id,
      value = stats,
      permission_read = 1,
      permission_write = 0,
    },
  })
end

local function update_leaderboard(username, stats, user_id)
  nk.leaderboard_record_write(
    LEADERBOARD_ID,
    user_id,
    username,
    stats.wins,
    stats.streak,
    { losses = stats.losses }
  )
end

local function finish_ranked_win(state, winner_uid, loser_uid)
  local w = read_stats(winner_uid)
  local l = read_stats(loser_uid)
  w.wins = w.wins + 1
  w.streak = w.streak + 1
  l.losses = l.losses + 1
  l.streak = 0

  write_stats(winner_uid, w)
  write_stats(loser_uid, l)

  update_leaderboard(state.usernames[winner_uid] or "", w, winner_uid)
  update_leaderboard(state.usernames[loser_uid] or "", l, loser_uid)
end

local function finish_draw(state)
  local wx = read_stats(state.mark_x_user)
  local wo = read_stats(state.mark_o_user)
  wx.streak = 0
  wo.streak = 0
  write_stats(state.mark_x_user, wx)
  write_stats(state.mark_o_user, wo)
end

local function finish_game(state, winner_uid, loser_uid)
  if state.status == "finished" then
    return
  end
  state.status = "finished"
  finish_ranked_win(state, winner_uid, loser_uid)
end

local function can_start_game(state)
  return state.status == "waiting" and
    state.seats == state.required_player_count and
    state.mark_x_user ~= nil and
    state.mark_o_user ~= nil
end

local function start_game(state, tick, tick_rate)
  if not can_start_game(state) then
    return false
  end
  state.status = "playing"
  state.winner = nil
  state.finish_reason = nil
  if state.game_mode == "timed" then
    state.turn_deadline_tick = tick + (TURN_SECONDS * tick_rate)
  else
    state.turn_deadline_tick = nil
  end
  return true
end

local function pending_reservation_count(state, tick)
  local count = 0
  if state.join_reservations == nil then
    state.join_reservations = {}
    return 0
  end
  for uid, expiry_tick in pairs(state.join_reservations) do
    if expiry_tick == nil or expiry_tick <= tick or state.marks[uid] then
      state.join_reservations[uid] = nil
    else
      count = count + 1
    end
  end
  return count
end

local function current_turn_seconds_remaining(state, tick, tick_rate)
  if
    state.game_mode ~= "timed" or
    state.status ~= "playing" or
    state.turn_deadline_tick == nil or
    tick_rate <= 0
  then
    return 0
  end

  return math.max(0, math.ceil((state.turn_deadline_tick - tick) / tick_rate))
end

local function encode_state(state, tick, tick_rate)
  local cells = {}
  for i = 1, 9 do
    local v = state.board[i]
    if v == 0 then
      table.insert(cells, "")
    elseif v == 1 then
      table.insert(cells, "X")
    else
      table.insert(cells, "O")
    end
  end

  local remaining = current_turn_seconds_remaining(state, tick, tick_rate)

  local body = {
    cells = cells,
    current_mark = state.current_mark,
    winner = state.winner,
    status = state.status,
    finish_reason = state.finish_reason,
    game_mode = state.game_mode,
    room_type = state.room_type,
    marks = state.marks,
    usernames = state.usernames,
    turn_seconds_remaining = remaining,
    -- distinct Nakama user_ids seated in the match (two tabs same browser = 1)
    player_count = state.seats,
  }
  return nk.json_encode(body)
end

local function broadcast_state(dispatcher, state, tick, tick_rate)
  if state.game_mode == "timed" and state.status == "playing" and state.winner == nil then
    state.last_timer_broadcast_remaining = current_turn_seconds_remaining(state, tick, tick_rate)
  else
    state.last_timer_broadcast_remaining = nil
  end
  dispatcher.broadcast_message(OP_STATE, encode_state(state, tick, tick_rate), nil, nil)
end

local function match_init(context, params)
  local mode = "classic"
  if params and params.game_mode == "timed" then
    mode = "timed"
  end
  local room_type = "public"
  if params and params.room_type == "private" then
    room_type = "private"
  elseif params and params.room_type == "matchmaking" then
    room_type = "matchmaking"
  end
  local tick_rate = 5
  local state = {
    board = { 0, 0, 0, 0, 0, 0, 0, 0, 0 },
    seats = 0,
    required_player_count = 2,
    marks = {},
    usernames = {},
    mark_x_user = nil,
    mark_o_user = nil,
    current_mark = "X",
    winner = nil,
    finish_reason = nil,
    status = "waiting",
    game_mode = mode,
    room_type = room_type,
    turn_deadline_tick = nil,
    tick_rate = tick_rate,
    join_reservations = {},
    last_timer_broadcast_remaining = nil,
  }
  local label = build_label(state)
  return state, tick_rate, label
end

local function match_join_attempt(context, dispatcher, tick, state, presence, metadata)
  if state.status == "finished" then
    return state, false, "match_finished"
  end
  if state.marks[presence.user_id] then
    return state, true
  end

  local pending = pending_reservation_count(state, tick)
  if state.seats + pending >= state.required_player_count then
    return state, false, "match_full"
  end

  state.join_reservations[presence.user_id] = tick + JOIN_RESERVE_TICKS
  return state, true
end

local function match_join(context, dispatcher, tick, state, presences)
  for _, p in ipairs(presences) do
    state.join_reservations[p.user_id] = nil
    state.usernames[p.user_id] = p.username or ""
    if not state.marks[p.user_id] then
      state.seats = state.seats + 1
      if state.mark_x_user == nil then
        state.mark_x_user = p.user_id
        state.marks[p.user_id] = "X"
      else
        state.mark_o_user = p.user_id
        state.marks[p.user_id] = "O"
      end
    end
  end
  if state.seats == state.required_player_count and state.status == "waiting" then
    start_game(state, tick, state.tick_rate)
  end

  update_label(dispatcher, state)
  broadcast_state(dispatcher, state, tick, state.tick_rate)
  return state
end

local function match_leave(context, dispatcher, tick, state, presences)
  for _, p in ipairs(presences) do
    state.join_reservations[p.user_id] = nil
    local mark = state.marks[p.user_id]
    if state.status == "playing" and state.winner == nil and mark then
      if mark == "X" then
        state.winner = "O"
        state.finish_reason = "opponent_left"
        finish_game(state, state.mark_o_user, state.mark_x_user)
      else
        state.winner = "X"
        state.finish_reason = "opponent_left"
        finish_game(state, state.mark_x_user, state.mark_o_user)
      end
    end
    state.marks[p.user_id] = nil
    state.usernames[p.user_id] = nil
    state.seats = math.max(0, state.seats - 1)
    if state.mark_x_user == p.user_id then
      state.mark_x_user = nil
    end
    if state.mark_o_user == p.user_id then
      state.mark_o_user = nil
    end
  end

  update_label(dispatcher, state)
  broadcast_state(dispatcher, state, tick, state.tick_rate)
  return state
end

local function match_loop(context, dispatcher, tick, state, messages)
  local tr = state.tick_rate or context.match_tick_rate or 5
  pending_reservation_count(state, tick)

  for _, m in ipairs(messages) do
    if m.op_code == OP_MOVE and state.status == "playing" and state.winner == nil then
      local ok, payload = pcall(nk.json_decode, m.data)
      if ok and payload and payload.cell ~= nil then
        local cell = tonumber(payload.cell)
        local uid = m.sender.user_id
        local mark = state.marks[uid]
        if mark and mark == state.current_mark and cell and cell >= 0 and cell <= 8 then
          local idx = cell + 1
          if state.board[idx] == 0 then
            state.board[idx] = (mark == "X") and 1 or 2
            local w = check_winner(state.board)
            if w == 1 then
              state.winner = "X"
              state.finish_reason = "board_win"
              finish_game(state, state.mark_x_user, state.mark_o_user)
            elseif w == 2 then
              state.winner = "O"
              state.finish_reason = "board_win"
              finish_game(state, state.mark_o_user, state.mark_x_user)
            elseif board_full(state.board) then
              state.status = "finished"
              state.winner = "draw"
              state.finish_reason = "draw"
              finish_draw(state)
            else
              state.current_mark = (state.current_mark == "X") and "O" or "X"
              if state.game_mode == "timed" then
                state.turn_deadline_tick = tick + (TURN_SECONDS * tr)
              end
            end
            update_label(dispatcher, state)
            broadcast_state(dispatcher, state, tick, tr)
          end
        end
      end
    end
  end

  if state.game_mode == "timed" and state.status == "playing" and state.winner == nil and state.turn_deadline_tick then
    if tick >= state.turn_deadline_tick then
      if state.current_mark == "X" then
        state.winner = "O"
        state.finish_reason = "timeout"
        finish_game(state, state.mark_o_user, state.mark_x_user)
      else
        state.winner = "X"
        state.finish_reason = "timeout"
        finish_game(state, state.mark_x_user, state.mark_o_user)
      end
      update_label(dispatcher, state)
      broadcast_state(dispatcher, state, tick, tr)
    end
  end

  if state.game_mode == "timed" and state.status == "playing" and state.winner == nil then
    local remaining = current_turn_seconds_remaining(state, tick, tr)
    if state.last_timer_broadcast_remaining ~= remaining then
      broadcast_state(dispatcher, state, tick, tr)
    end
  end

  return state
end

local function match_terminate(context, dispatcher, tick, state, grace_seconds)
  return state
end

local function match_signal(context, dispatcher, tick, state, data)
  return state, ""
end

return {
  match_init = match_init,
  match_join_attempt = match_join_attempt,
  match_join = match_join,
  match_leave = match_leave,
  match_loop = match_loop,
  match_terminate = match_terminate,
  match_signal = match_signal,
}
