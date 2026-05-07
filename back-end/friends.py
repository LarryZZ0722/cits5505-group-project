"""
friends.py — Friend relationships and requests

  GET    /api/friends
  DELETE /api/friends/<student_number>
  GET    /api/friends/requests/pending
  GET    /api/friends/requests/sent
  POST   /api/friends/requests
  PUT    /api/friends/requests/<student_number>/accept
  DELETE /api/friends/requests/<student_number>
  DELETE /api/friends/requests/sent/<student_number>
  GET    /api/friends/<student_number>/timetables
"""

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required
from models import db, User, Friendship, FriendRequest
from utils import ok, err, current_user, user_dict

friends_bp = Blueprint('friends', __name__)


@friends_bp.get('/api/friends')
@jwt_required()
def get_friends():
    user = current_user()
    return jsonify([
        {**user_dict(fs.friend), 'addedAt': fs.created_at.isoformat() + 'Z'}
        for fs in user.friendships
    ])


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


@friends_bp.get('/api/friends/requests/pending')
@jwt_required()
def get_pending_requests():
    user = current_user()
    return jsonify([
        {**user_dict(r.sender), 'requestedAt': r.sent_at.isoformat() + 'Z'}
        for r in user.recv_requests
    ])


@friends_bp.get('/api/friends/requests/sent')
@jwt_required()
def get_sent_requests():
    user = current_user()
    return jsonify([
        {**user_dict(r.recipient), 'sentAt': r.sent_at.isoformat() + 'Z'}
        for r in user.sent_requests
    ])


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


@friends_bp.put('/api/friends/requests/<student_number>/accept')
@jwt_required()
def accept_friend_request(student_number):
    user   = current_user()
    sender = User.query.filter_by(student_number=student_number).first()
    if not sender:
        return err('User not found', 404)
    req = FriendRequest.query.filter_by(sender_id=sender.id, recipient_id=user.id).first()
    if not req:
        return ok()
    db.session.delete(req)
    for row in Friendship.make(user.id, sender.id):
        if not Friendship.query.filter_by(user_id=row.user_id, friend_id=row.friend_id).first():
            db.session.add(row)
    db.session.commit()
    return ok()


@friends_bp.delete('/api/friends/requests/<student_number>')
@jwt_required()
def decline_friend_request(student_number):
    user   = current_user()
    sender = User.query.filter_by(student_number=student_number).first()
    if sender:
        FriendRequest.query.filter_by(sender_id=sender.id, recipient_id=user.id).delete()
        db.session.commit()
    return ok()


@friends_bp.delete('/api/friends/requests/sent/<student_number>')
@jwt_required()
def cancel_friend_request(student_number):
    user      = current_user()
    recipient = User.query.filter_by(student_number=student_number).first()
    if recipient:
        FriendRequest.query.filter_by(sender_id=user.id, recipient_id=recipient.id).delete()
        db.session.commit()
    return ok()


@friends_bp.get('/api/friends/<student_number>/timetables')
@jwt_required()
def get_friend_timetables(student_number):
    me     = current_user()
    friend = User.query.filter_by(student_number=student_number).first()
    if not friend:
        current_app.logger.info(f'[timetables] {student_number} not found')
        return err('User not found', 404)
    is_friend = Friendship.query.filter_by(user_id=me.id, friend_id=friend.id).first()
    current_app.logger.info(
        f'[timetables] me={me.student_number} friend={student_number} '
        f'is_friend={bool(is_friend)} '
        f'tts={[(tt.name, tt.is_public) for tt in friend.timetables]}'
    )
    if not is_friend:
        return err('Not friends', 403)
    result = []
    for tt in friend.timetables:
        if tt.is_public:
            d = tt.to_dict()
            d['owner'] = {
                'name':          friend.name,
                'initials':      friend.initials,
                'studentNumber': friend.student_number,
            }
            result.append(d)
    return jsonify(result)
