# friends.py — Friends endpoints
# Kalp Riteshkumar Prajapati (25073034)
# Handles: list friends, remove friend, send/cancel/accept/decline requests, view friend timetable

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db, User, Friendship, FriendRequest

friends_bp = Blueprint('friends', __name__)

# ── Helpers ───────────────────────────────────────────────────────────

def user_dict(u: User) -> dict:
    return {
        'id':            u.id,
        'name':          u.name,
        'initials':      u.initials,
        'email':         u.email,
        'studentNumber': u.student_number,
    }

def err(msg: str, status: int = 400):
    return jsonify({'message': msg}), status

def ok():
    return jsonify({'ok': True})

def current_user():
    return db.session.get(User, int(get_jwt_identity()))

# ── GET /api/friends ──────────────────────────────────────────────────

@friends_bp.get('/api/friends')
@jwt_required()
def get_friends():
    user = current_user()
    return jsonify([
        {**user_dict(fs.friend), 'addedAt': fs.created_at.isoformat() + 'Z'}
        for fs in user.friendships
    ])


# ── DELETE /api/friends/<student_number> ──────────────────────────────

@friends_bp.delete('/api/friends/<student_number>')
@jwt_required()
def remove_friend(student_number):
    user   = current_user()
    friend = User.query.filter_by(student_number=student_number).first()
    if friend:
        Friendship.query.filter(
            ((Friendship.user_id   == user.id)   & (Friendship.friend_id == friend.id)) |
            ((Friendship.user_id   == friend.id) & (Friendship.friend_id == user.id))
        ).delete(synchronize_session=False)
        db.session.commit()
    return ok()


# ── POST /api/friends/requests ────────────────────────────────────────

@friends_bp.post('/api/friends/requests')
@jwt_required()
def send_friend_request():
    user      = current_user()
    data      = request.get_json(silent=True) or {}
    recipient = User.query.filter_by(student_number=data.get('studentNumber', '')).first()

    if not recipient:
        return err('User not found', 404)
    if recipient.id == user.id:
        return err('Cannot send a request to yourself', 422)
    if Friendship.query.filter_by(user_id=user.id, friend_id=recipient.id).first():
        return err('Already friends', 409)
    if not FriendRequest.query.filter_by(sender_id=user.id, recipient_id=recipient.id).first():
        db.session.add(FriendRequest(sender_id=user.id, recipient_id=recipient.id))
        db.session.commit()
    return ok()


# ── GET /api/friends/requests/sent ───────────────────────────────────

@friends_bp.get('/api/friends/requests/sent')
@jwt_required()
def get_sent_requests():
    user = current_user()
    return jsonify([
        {**user_dict(r.recipient), 'sentAt': r.sent_at.isoformat() + 'Z'}
        for r in user.sent_requests
    ])


# ── DELETE /api/friends/requests/sent/<student_number> ───────────────

@friends_bp.delete('/api/friends/requests/sent/<student_number>')
@jwt_required()
def cancel_friend_request(student_number):
    user      = current_user()
    recipient = User.query.filter_by(student_number=student_number).first()
    if recipient:
        FriendRequest.query.filter_by(
            sender_id=user.id, recipient_id=recipient.id
        ).delete()
        db.session.commit()
    return ok()


# ── GET /api/friends/requests/pending ────────────────────────────────

@friends_bp.get('/api/friends/requests/pending')
@jwt_required()
def get_pending_requests():
    user = current_user()
    return jsonify([
        {**user_dict(r.sender), 'requestedAt': r.sent_at.isoformat() + 'Z'}
        for r in user.recv_requests
    ])


# ── PUT /api/friends/requests/<student_number>/accept ────────────────

@friends_bp.put('/api/friends/requests/<student_number>/accept')
@jwt_required()
def accept_friend_request(student_number):
    user   = current_user()
    sender = User.query.filter_by(student_number=student_number).first()
    if not sender:
        return err('User not found', 404)

    req = FriendRequest.query.filter_by(
        sender_id=sender.id, recipient_id=user.id
    ).first()
    if not req:
        return ok()

    db.session.delete(req)
    for row in Friendship.make(user.id, sender.id):
        if not Friendship.query.filter_by(
            user_id=row.user_id, friend_id=row.friend_id
        ).first():
            db.session.add(row)
    db.session.commit()
    return ok()


# ── DELETE /api/friends/requests/<student_number> ────────────────────

@friends_bp.delete('/api/friends/requests/<student_number>')
@jwt_required()
def decline_friend_request(student_number):
    user   = current_user()
    sender = User.query.filter_by(student_number=student_number).first()
    if sender:
        FriendRequest.query.filter_by(
            sender_id=sender.id, recipient_id=user.id
        ).delete()
        db.session.commit()
    return ok()


# ── GET /api/friends/<student_number>/timetable ───────────────────────

@friends_bp.get('/api/friends/<student_number>/timetable')
@jwt_required()
def get_friend_timetable(student_number):
    friend = User.query.filter_by(student_number=student_number).first()
    if not friend or not friend.timetable or not friend.timetable.is_public:
        return jsonify(None)

    data = friend.timetable.to_dict()
    data['timetableName'] = data.get('name')
    data['owner'] = {
        'name':          friend.name,
        'initials':      friend.initials,
        'studentNumber': friend.student_number,
    }
    return jsonify(data)