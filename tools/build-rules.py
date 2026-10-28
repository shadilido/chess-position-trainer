#!/usr/bin/env python3
"""Builds database.rules.json (Firebase Realtime Database security rules).

The rules are the server-side anti-cheat: the app is open source, so nothing on the
client can be trusted. They enforce:
  * only signed-in, non-guest, non-banned accounts can write
  * ratings / stats can only change by applying a finished, verified game you played,
    exactly once, within Elo bounds (either player may apply both sides, so a loss
    cannot be dodged by closing the app)
  * game history is append-only; only the side to move can add a move; clocks can
    only run down; results must match how the game ended (you can only resign for
    yourself, claim time when the clock is really out, claim abandonment when the
    opponent is really offline, ...)
  * fair-play records and reports can only be filed by the opponent of a real game
Run:  python3 tools/build-rules.py   (writes database.rules.json in the repo root)
"""
import json, os

def all_(*xs): return '(' + ' && '.join(xs) + ')'
def any_(*xs): return '(' + ' || '.join(xs) + ')'

SIGNED = "auth != null && auth.token.firebase.sign_in_provider !== 'anonymous'"
OK = f"({SIGNED} && !root.child('banned/' + auth.uid).exists())"

# ---------------------------------------------------------------- users
N = "newData"; D = "data"
def same(f, n=N, d=D): return f"{n}.child('{f}').val() === {d}.child('{f}').val()"
def num(f, n=N): return f"{n}.child('{f}').val()"

LAST = "newData.child('last').val()"
G = f"root.child('games/' + {LAST})"
NG = f"newData.parent().parent().child('games/' + {LAST})"
def gv(f): return f"{G}.child('{f}').val()"

ME_WHITE = f"{gv('white')} === $uid"
ME_BLACK = f"{gv('black')} === $uid"
WIN = any_(all_(ME_WHITE, f"{gv('result')} === 'w'"), all_(ME_BLACK, f"{gv('result')} === 'b'"))
LOSS = any_(all_(ME_WHITE, f"{gv('result')} === 'b'"), all_(ME_BLACK, f"{gv('result')} === 'w'"))
DRAW = f"{gv('result')} === 'd'"
VERIFIED = any_(
    f"{gv('reason')} === 'resign'", f"{gv('reason')} === 'agreement'",
    f"{gv('reason')} === 'time'", f"{gv('reason')} === 'abandon'",
    all_(f"{gv('endBy')} === {gv('white')}", f"{G}.child('ack/' + {gv('black')}).val() === true"),
    all_(f"{gv('endBy')} === {gv('black')}", f"{G}.child('ack/' + {gv('white')}).val() === true"),
    f"now - {gv('endedAt')} > 600000",
)
R = num('rating', N); RD = num('rating', D)
APPLY = all_(
    "data.exists()",
    f"newData.child('last').isString()", f"!({same('last')})",
    f"{gv('status')} === 'over'",
    any_(ME_WHITE, ME_BLACK),
    any_(f"{gv('white')} === auth.uid", f"{gv('black')} === auth.uid"),
    f"!{G}.child('applied/' + $uid).exists()",
    f"{NG}.child('applied/' + $uid).val() === true",
    f"!{G}.child('disputed').exists()",
    VERIFIED,
    same('name'), same('created'), same('nameSet'),
    f"{num('games')} === {num('games', D)} + 1",
    any_(
        all_(WIN, f"{num('wins')} === {num('wins', D)} + 1", same('losses'), same('draws'), f"{R} >= {RD}", f"{R} <= {RD} + 40"),
        all_(LOSS, f"{num('losses')} === {num('losses', D)} + 1", same('wins'), same('draws'), f"{R} <= {RD}", f"{R} >= {RD} - 40"),
        all_(DRAW, f"{num('draws')} === {num('draws', D)} + 1", same('wins'), same('losses'), f"{R} <= {RD} + 40", f"{R} >= {RD} - 40"),
    ),
)
CREATE_PROFILE = all_(
    "!data.exists()", "auth.uid === $uid",
    f"{R} === 1200", f"{num('games')} === 0", f"{num('wins')} === 0", f"{num('losses')} === 0", f"{num('draws')} === 0",
    "!newData.child('last').exists()",
)
EDIT_PROFILE = all_(
    "data.exists()", "auth.uid === $uid",
    same('rating'), same('games'), same('wins'), same('losses'), same('draws'), same('last'),
)
users = {
    "$uid": {
        ".read": SIGNED,
        ".write": f"{OK} && (auth.uid === $uid || (data.exists() && newData.exists()))",
        ".validate": any_(CREATE_PROFILE, EDIT_PROFILE, APPLY),
        "name": {".validate": "newData.isString() && newData.val().length > 0 && newData.val().length <= 20"},
        "rating": {".validate": "newData.isNumber() && newData.val() >= 100 && newData.val() <= 4000"},
        "games": {".validate": "newData.isNumber()"},
        "wins": {".validate": "newData.isNumber()"},
        "losses": {".validate": "newData.isNumber()"},
        "draws": {".validate": "newData.isNumber()"},
    }
}

# ---------------------------------------------------------------- games
def n(f): return f"newData.child('{f}').val()"
def d(f): return f"data.child('{f}').val()"
def sm(f): return f"newData.child('{f}').val() === data.child('{f}').val()"

ME_W = f"{d('white')} === auth.uid"
ME_B = f"{d('black')} === auth.uid"
MY_TURN = any_(all_(ME_W, f"{d('turn')} === 'w'"), all_(ME_B, f"{d('turn')} === 'b'"))
CLOCKS_SAME = all_(sm('clock/w'), sm('clock/b'))
FRESH = f"{n('endedAt')} <= now + 3000 && {n('endedAt')} >= now - 10000 && {n('endBy')} === auth.uid"
# post-game records can never be removed
def keep(path):
    return all_(
        f"(!data.child('{path}/' + {d('white')}).exists() || newData.child('{path}/' + {d('white')}).exists())",
        f"(!data.child('{path}/' + {d('black')}).exists() || newData.child('{path}/' + {d('black')}).exists())",
    )
IMMUTABLE = all_(*[sm(f) for f in ['white', 'black', 'wName', 'bName', 'wRating', 'bRating', 'startFen', 'tc/base', 'tc/inc', 'created', 'mode']])

def clock_ok():
    # after the first two plies the mover's clock is charged for the time used (+ increment, 1.5s slack)
    used = f"({n('lastMoveAt')} - {d('lastMoveAt')})"
    w = all_(f"{d('turn')} === 'w'", sm('clock/b'), f"{n('clock/w')} <= {d('clock/w')} - {used} + {d('tc/inc')} + 1500", f"{n('clock/w')} > 0")
    b = all_(f"{d('turn')} === 'b'", sm('clock/w'), f"{n('clock/b')} <= {d('clock/b')} - {used} + {d('tc/inc')} + 1500", f"{n('clock/b')} > 0")
    return any_(all_(f"{d('ply')} < 2", CLOCKS_SAME), all_(f"{d('ply')} >= 2", any_(w, b)))

MOVE_END_REASON = any_(*[f"{n('reason')} === '{r}'" for r in ['stalemate', 'repetition', 'insufficient', 'fifty']])
MOVE = all_(
    f"{n('ply')} === {d('ply')} + 1",
    MY_TURN,
    f"({n('turn')} === 'w' || {n('turn')} === 'b')", f"{n('turn')} !== {d('turn')}",
    f"newData.child('moves/' + {d('ply')}).isString()",
    f"newData.child('moves/' + {d('ply')}).val().length >= 4", f"newData.child('moves/' + {d('ply')}).val().length <= 5",
    f"{n('lastMoveAt')} <= now + 3000", f"{n('lastMoveAt')} >= now - 10000", f"{n('lastMoveAt')} >= {d('lastMoveAt')}",
    clock_ok(),
    f"(!newData.child('drawOffer').exists() || {sm('drawOffer')})",
    any_(
        f"{n('status')} === 'active'",
        all_(f"{n('status')} === 'over'", FRESH, any_(
            all_(f"{n('reason')} === 'mate'", f"{n('result')} === {d('turn')}"),
            all_(MOVE_END_REASON, f"{n('result')} === 'd'"),
        )),
    ),
)
OPP_GONE = any_(all_(ME_W, f"!root.child('presence/' + {d('black')}).exists()"), all_(ME_B, f"!root.child('presence/' + {d('white')}).exists()"))
def my_color(expr): return any_(all_(ME_W, f"{expr} === 'w'"), all_(ME_B, f"{expr} === 'b'"))
def opp_color(expr): return any_(all_(ME_W, f"{expr} === 'b'"), all_(ME_B, f"{expr} === 'w'"))
TIME = all_(
    f"{n('status')} === 'over'", f"{n('reason')} === 'time'", f"{d('ply')} >= 2",
    any_(
        all_(f"{d('turn')} === 'w'", f"now >= {d('lastMoveAt')} + {d('clock/w')} - 1000", f"{n('clock/w')} === 0", sm('clock/b'),
             any_(f"{n('result')} === 'b'", all_(f"{n('result')} === 'd'", ME_B))),
        all_(f"{d('turn')} === 'b'", f"now >= {d('lastMoveAt')} + {d('clock/b')} - 1000", f"{n('clock/b')} === 0", sm('clock/w'),
             any_(f"{n('result')} === 'w'", all_(f"{n('result')} === 'd'", ME_W))),
    ),
)
END_NO_MOVE = all_(
    FRESH,
    any_(
        all_(f"{n('status')} === 'over'", f"{n('reason')} === 'resign'", opp_color(n('result')), CLOCKS_SAME),
        all_(f"{n('status')} === 'over'", f"{n('reason')} === 'agreement'", f"{n('result')} === 'd'", opp_color(d('drawOffer')), CLOCKS_SAME),
        all_(f"{n('status')} === 'aborted'", f"{n('reason')} === 'abort'", f"{n('result')} === 'x'", f"{d('ply')} < 2", CLOCKS_SAME),
        all_(f"{n('status')} === 'aborted'", f"{n('reason')} === 'nomove'", f"{n('result')} === 'x'", f"{d('ply')} < 2", f"now - {d('lastMoveAt')} > 28000", CLOCKS_SAME),
        all_(f"{n('status')} === 'over'", f"{n('reason')} === 'abandon'", my_color(n('result')), OPP_GONE, f"now - {d('lastMoveAt')} > 44000", CLOCKS_SAME),
        # "opponent sent an illegal move": not checkable here, so it only counts once the accused player's app confirms it (or 10 quiet minutes)
        all_(f"{n('status')} === 'over'", f"{n('reason')} === 'illegal'", my_color(n('result')), CLOCKS_SAME),
        TIME,
    ),
)
NO_MOVE = all_(
    f"{n('ply')} === {d('ply')}", sm('turn'), sm('lastMoveAt'),
    any_(
        all_(f"{n('status')} === 'active'", CLOCKS_SAME,
             f"(!newData.child('drawOffer').exists() || {sm('drawOffer')} || {my_color(n('drawOffer'))})"),
        END_NO_MOVE,
    ),
)
ACTIVE_EDIT = all_(f"{d('status')} === 'active'", any_(MOVE, NO_MOVE))
POST_EDIT = all_(
    f"{d('status')} !== 'active'",
    *[sm(f) for f in ['status', 'result', 'reason', 'endBy', 'endedAt', 'ply', 'turn', 'lastMoveAt', 'clock/w', 'clock/b', 'drawOffer']],
    keep('applied'), keep('ack'), keep('disputed'),
)
def prof(uidexpr, f): return f"root.child('users/' + {uidexpr} + '/{f}').val()"
CREATE_GAME = all_(
    "!data.exists()",
    f"newData.child('white').isString()", f"newData.child('black').isString()", f"{n('white')} !== {n('black')}",
    f"{n('status')} === 'active'", f"{n('ply')} === 0", "!newData.child('moves').exists()",
    "!newData.child('result').exists()", "!newData.child('applied').exists()", "!newData.child('ack').exists()",
    f"newData.child('tc/base').isNumber()", f"{n('tc/base')} >= 60000", f"{n('tc/base')} <= 3600000",
    f"newData.child('tc/inc').isNumber()", f"{n('tc/inc')} >= 0", f"{n('tc/inc')} <= 60000",
    f"{n('clock/w')} === {n('tc/base')}", f"{n('clock/b')} === {n('tc/base')}",
    f"newData.child('startFen').isString()", f"{n('startFen')}.length < 100",
    any_(all_(f"{n('startFen')}.contains(' w ')", f"{n('turn')} === 'w'"), all_(f"{n('startFen')}.contains(' b ')", f"{n('turn')} === 'b'")),
    f"{n('lastMoveAt')} <= now + 3000", f"{n('lastMoveAt')} >= now - 60000",
    f"{n('wRating')} === {prof(n('white'), 'rating')}", f"{n('bRating')} === {prof(n('black'), 'rating')}",
    f"{n('wName')} === {prof(n('white'), 'name')}", f"{n('bName')} === {prof(n('black'), 'name')}",
)
PLAYER_OF = lambda col, path: any_(all_(f"{col} === 'w'", f"{path}.child('white').val() === auth.uid"), all_(f"{col} === 'b'", f"{path}.child('black').val() === auth.uid"))
GAME_NEW = "newData.parent().parent()"     # from games/$gid/<x>/$y
games = {
    "$gid": {
        ".read": SIGNED,
        ".write": f"{OK} && ((!data.exists() && !newData.exists()) || (!data.exists() && ({n('white')} === auth.uid || {n('black')} === auth.uid)) || (data.exists() && newData.exists() && ({ME_W} || {ME_B})))",
        ".validate": any_(CREATE_GAME, all_("data.exists()", IMMUTABLE, any_(ACTIVE_EDIT, POST_EDIT))),
        "moves": {"$i": {".validate": "!data.exists() || newData.val() === data.val()"}},
        "applied": {"$uid": {".validate": any_(
            "data.exists() && newData.val() === data.val()",
            all_("!data.exists()", "newData.val() === true",
                 f"({GAME_NEW}.child('white').val() === $uid || {GAME_NEW}.child('black').val() === $uid)",
                 f"{GAME_NEW}.parent().parent().child('users/' + $uid + '/last').val() === $gid"),
        )}},
        "ack": {"$uid": {".validate": any_(
            "data.exists() && newData.val() === data.val()",
            all_("!data.exists()", "$uid === auth.uid", "newData.val() === true", f"{GAME_NEW}.child('status').val() === 'over'"),
        )}},
        "disputed": {"$uid": {".validate": any_(
            "data.exists() && newData.val() === data.val()",
            all_("!data.exists()", "$uid === auth.uid", "newData.isString()", "newData.val().length <= 40", f"{GAME_NEW}.child('status').val() === 'over'"),
        )}},
        "rematch": {"$c": {".validate": any_(
            "data.exists() && newData.val() === data.val()",
            all_("newData.val() === true", PLAYER_OF("$c", GAME_NEW)),
        )}},
        "next": {".validate": "(data.exists() && newData.val() === data.val()) || (!data.exists() && newData.isString() && newData.parent().child('status').val() !== 'active' && newData.parent().child('rematch/w').val() === true && newData.parent().child('rematch/b').val() === true)"},
        "focus": {"$c": {".validate": any_(
            "data.exists() && newData.child('n').val() === data.child('n').val() && newData.child('ms').val() === data.child('ms').val()",
            all_(PLAYER_OF("$c", GAME_NEW), "newData.child('n').isNumber()", "newData.child('ms').isNumber()"),
        )}},
    }
}

# ---------------------------------------------------------------- the rest
lobbies = {
    "$code": {
        ".read": SIGNED,
        ".write": f"{OK} && ((!data.exists() && !newData.exists()) || (!data.exists() && newData.child('host').val() === auth.uid) || (data.exists() && data.child('host').val() === auth.uid) || (data.exists() && newData.exists() && newData.child('host').val() === data.child('host').val() && (!data.child('guest').exists() || data.child('guest').val() === auth.uid) && (!newData.child('guest').exists() || newData.child('guest').val() === auth.uid)))",
    }
}
FP_GAME = "root.child('games/' + $gid)"
fairplay = {
    "$uid": {
        ".read": SIGNED,
        "$gid": {
            ".write": f"{OK} && !data.exists() && newData.exists() && $uid !== auth.uid",
            ".validate": all_(
                f"{FP_GAME}.child('status').val() === 'over'",
                any_(all_(f"{FP_GAME}.child('white').val() === auth.uid", f"{FP_GAME}.child('black').val() === $uid"),
                     all_(f"{FP_GAME}.child('black').val() === auth.uid", f"{FP_GAME}.child('white').val() === $uid")),
                "newData.child('by').val() === auth.uid",
                "newData.child('n').isNumber()", "newData.child('match').isNumber()", "newData.child('acpl').isNumber()",
                "newData.child('flag').isBoolean()",
            ),
        },
    }
}
RP = "root.child('games/' + newData.child('gid').val())"
reports = {
    "$rid": {
        ".write": f"{OK} && !data.exists() && newData.exists()",
        ".validate": all_(
            "newData.child('by').val() === auth.uid",
            "newData.child('against').isString()", "newData.child('against').val() !== auth.uid",
            "newData.child('gid').isString()",
            any_(all_(f"{RP}.child('white').val() === auth.uid", f"{RP}.child('black').val() === newData.child('against').val()"),
                 all_(f"{RP}.child('black').val() === auth.uid", f"{RP}.child('white').val() === newData.child('against').val()")),
            "newData.child('reason').isString()", "newData.child('reason').val().length <= 40",
            "!newData.child('note').exists() || (newData.child('note').isString() && newData.child('note').val().length <= 300)",
        ),
    }
}
rules = {"rules": {
    "users": users,
    "presence": {"$uid": {".read": SIGNED, ".write": f"{SIGNED} && auth.uid === $uid"}},
    "queue": {"$pool": {".read": SIGNED, ".write": OK}},
    "lobbies": lobbies,
    "games": games,
    "fairplay": fairplay,
    "reports": reports,
    "banned": {"$uid": {".read": "auth != null && auth.uid === $uid", ".write": "false"}},
}}
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'database.rules.json')
with open(out, 'w') as f:
    json.dump(rules, f, indent=2)
print('wrote', os.path.normpath(out), os.path.getsize(out), 'bytes')
