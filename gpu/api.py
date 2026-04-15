import hashlib
import hmac
import json

import frappe
import requests
from frappe import _
from frappe.utils import flt, get_url, now_datetime


APPLICATION_FIELDS = [
	"applicant_name", "sex", "date_of_birth", "place_of_birth", "residence",
	"nationality", "mobile", "email",
	"emergency_contact_name", "emergency_relationship", "emergency_address",
	"emergency_phone", "emergency_email",
	"media_house", "employer_address", "employer_tel", "employer_email",
	"publisher", "employer_start_date", "current_position",
	"senior_school", "senior_year_completed", "senior_qualification",
	"declaration_signature", "declaration_date",
]


def _clean_rows(rows, allowed_fields):
	cleaned = []
	if not rows:
		return cleaned
	if isinstance(rows, str):
		try:
			rows = json.loads(rows)
		except Exception:
			return cleaned
	for row in rows or []:
		if not isinstance(row, dict):
			continue
		if not any(row.get(f) for f in allowed_fields):
			continue
		cleaned.append({f: row.get(f) for f in allowed_fields})
	return cleaned


def _get_settings():
	return frappe.get_single("GPU Settings")


def _build_form_payload(data):
	payload = {f: data.get(f) for f in APPLICATION_FIELDS}
	payload["agreed"] = 1 if data.get("agreed") in (1, "1", True, "true", "on") else 0
	payload["experience"] = _clean_rows(
		data.get("experience"),
		["institution_name", "address", "start_date", "end_date"],
	)
	payload["tertiary_education"] = _clean_rows(
		data.get("tertiary_education"),
		["institution", "address", "course_name", "duration", "date_graduated", "qualification"],
	)
	payload["referees"] = _clean_rows(
		data.get("referees"),
		["referee_name", "address", "phone_number", "place_of_work", "position"],
	)
	return payload


def _create_application_doc(form_payload, *, payment_status, checkout_id=None, payment_url=None, transaction_id=None, amount_paid=None):
	doc = frappe.get_doc({
		"doctype": "Gambia Press Union",
		**{f: form_payload.get(f) for f in APPLICATION_FIELDS},
		"agreed": form_payload.get("agreed", 0),
		"status": "Pending",
		"payment_status": payment_status,
		"experience": form_payload.get("experience") or [],
		"tertiary_education": form_payload.get("tertiary_education") or [],
		"referees": form_payload.get("referees") or [],
		"checkout_id": checkout_id,
		"payment_url": payment_url,
		"transaction_id": transaction_id,
		"amount_paid": amount_paid,
		"paid_at": now_datetime() if payment_status == "Paid" else None,
	})
	doc.flags.ignore_permissions = True
	doc.insert(ignore_permissions=True)
	return doc


def _jokoor_headers(api_key):
	return {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}


def _create_jokoor_checkout(form_payload, settings):
	api_key = settings.get_active_api_key()
	if not api_key:
		frappe.throw(_("Jokoor API key is not configured. Please set it in GPU Settings."))

	base_url = (settings.jokoor_api_base_url or "https://api.jokoor.com/v1").rstrip("/")

	success_url = settings.success_redirect_url or (get_url("/form") + "?paid=1")
	failure_url = settings.failure_redirect_url or (get_url("/form") + "?failed=1")

	payment_methods = [
		m.strip() for m in (settings.jokoor_payment_methods or "").split(",") if m.strip()
	]

	payload = {
		"amount": f"{flt(settings.application_fee):.2f}",
		"currency": settings.currency or "GMD",
		"description": settings.fee_description or "GPU Membership Application Fee",
		"customer_name": form_payload.get("applicant_name"),
		"customer_email": form_payload.get("email"),
		"customer_phone": form_payload.get("mobile"),
		"success_url": success_url,
		"failure_url": failure_url,
		"metadata": {
			"applicant_name": form_payload.get("applicant_name"),
			"email": form_payload.get("email"),
		},
	}
	if payment_methods:
		payload["payment_method_types"] = payment_methods

	try:
		resp = requests.post(
			f"{base_url}/checkouts",
			json=payload,
			headers=_jokoor_headers(api_key),
			timeout=30,
		)
	except requests.RequestException as e:
		frappe.log_error(message=str(e), title="Jokoor checkout network error")
		frappe.throw(_("Could not reach Jokoor. Please try again."))

	if resp.status_code >= 400:
		frappe.log_error(
			message=f"Status {resp.status_code}: {resp.text}",
			title="Jokoor checkout error",
		)
		frappe.throw(_("Jokoor rejected the checkout request. Please contact support."))

	return (resp.json() or {}).get("data") or {}


def _fetch_jokoor_checkout(checkout_id, settings):
	api_key = settings.get_active_api_key()
	if not api_key:
		return None
	base_url = (settings.jokoor_api_base_url or "https://api.jokoor.com/v1").rstrip("/")
	try:
		resp = requests.get(
			f"{base_url}/checkouts/{checkout_id}",
			headers=_jokoor_headers(api_key),
			timeout=20,
		)
	except requests.RequestException as e:
		frappe.log_error(message=str(e), title="Jokoor get checkout network error")
		return None
	if resp.status_code >= 400:
		frappe.log_error(
			message=f"Status {resp.status_code}: {resp.text[:500]}",
			title="Jokoor get checkout error",
		)
		return None
	return (resp.json() or {}).get("data") or {}


def _stash_pending(form_payload, checkout, settings):
	doc = frappe.get_doc({
		"doctype": "GPU Pending Application",
		"checkout_id": checkout.get("id"),
		"applicant_name": form_payload.get("applicant_name"),
		"email": form_payload.get("email"),
		"mobile": form_payload.get("mobile"),
		"amount": flt(checkout.get("amount") or settings.application_fee),
		"currency": checkout.get("currency") or settings.currency or "GMD",
		"payment_url": checkout.get("payment_url"),
		"form_data": json.dumps(form_payload),
	})
	doc.flags.ignore_permissions = True
	doc.insert(ignore_permissions=True)
	return doc


def _materialize_from_pending(checkout_id, checkout_data, settings):
	"""Given a paid Jokoor checkout, find the stashed form and create
	the Gambia Press Union record. Idempotent."""
	existing = frappe.db.get_value("Gambia Press Union", {"checkout_id": checkout_id}, "name")
	if existing:
		return existing

	pending_name = frappe.db.get_value("GPU Pending Application", {"checkout_id": checkout_id}, "name")
	if not pending_name:
		return None

	pending = frappe.get_doc("GPU Pending Application", pending_name)
	try:
		form_payload = json.loads(pending.form_data or "{}")
	except Exception:
		form_payload = {}

	tx = (checkout_data or {}).get("transaction") or {}
	doc = _create_application_doc(
		form_payload,
		payment_status="Paid",
		checkout_id=checkout_id,
		payment_url=pending.payment_url,
		transaction_id=tx.get("id") or (checkout_data or {}).get("transaction_id"),
		amount_paid=flt((checkout_data or {}).get("amount") or pending.amount or settings.application_fee),
	)

	frappe.delete_doc("GPU Pending Application", pending_name, ignore_permissions=True, force=True)
	return doc.name


@frappe.whitelist(allow_guest=True)
def submit_application(**data):
	"""Accept the public form. If Jokoor is enabled and the fee is > 0, we
	create a Jokoor Checkout, stash the form in GPU Pending Application, and
	return the payment URL. We do NOT create the real Gambia Press Union
	record until payment succeeds. If the fee is 0 or Jokoor is disabled,
	we create the record immediately."""
	form_payload = _build_form_payload(data)

	if not form_payload.get("applicant_name") or not form_payload.get("email"):
		frappe.throw(_("Name and email are required."))

	settings = _get_settings()
	fee = flt(settings.application_fee)

	if settings.jokoor_enabled and fee > 0:
		checkout = _create_jokoor_checkout(form_payload, settings)
		_stash_pending(form_payload, checkout, settings)
		frappe.db.commit()
		return {
			"payment_required": True,
			"payment_url": checkout.get("payment_url"),
			"checkout_id": checkout.get("id"),
			"amount": checkout.get("amount"),
			"currency": checkout.get("currency"),
		}

	doc = _create_application_doc(form_payload, payment_status="Not Required")
	frappe.db.commit()
	return {
		"payment_required": False,
		"name": doc.name,
		"applicant_name": doc.applicant_name,
	}


@frappe.whitelist(allow_guest=True)
def confirm_payment(checkout_id):
	"""Called by the React landing page at /form?paid=1&session_id=<checkout_id>.
	Pulls the checkout status from Jokoor, and if paid, creates the
	Gambia Press Union record from the stashed form data."""
	if not checkout_id:
		frappe.throw(_("Missing checkout id."))

	existing = frappe.db.get_value(
		"Gambia Press Union",
		{"checkout_id": checkout_id},
		["name", "applicant_name", "payment_status", "amount_paid"],
		as_dict=True,
	)
	if existing and existing.payment_status == "Paid":
		return existing

	settings = _get_settings()
	data = _fetch_jokoor_checkout(checkout_id, settings) or {}
	status_raw = (data.get("status") or "").lower()

	if status_raw in ("completed", "succeeded", "paid"):
		name = _materialize_from_pending(checkout_id, data, settings)
		if name:
			frappe.db.commit()
			doc = frappe.db.get_value(
				"Gambia Press Union",
				name,
				["name", "applicant_name", "payment_status", "amount_paid"],
				as_dict=True,
			)
			return doc
		# already materialized but not found above (race condition) — fall through
		if existing:
			return existing
		return {"payment_status": "Paid"}

	if status_raw in ("cancelled", "canceled", "expired"):
		return {"payment_status": "Cancelled"}
	if status_raw == "failed":
		return {"payment_status": "Failed"}

	return {"payment_status": (existing or {}).get("payment_status") or "Pending", "jokoor_status": status_raw or None}


def _verify_signature(raw_body: bytes, signature: str, secret: str) -> bool:
	if not secret:
		return True
	if not signature:
		return False
	expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
	candidate = signature.split("=", 1)[-1].strip()
	return hmac.compare_digest(expected, candidate)


@frappe.whitelist(allow_guest=True)
def jokoor_webhook():
	"""Receives checkout status updates from Jokoor. On success, promotes
	the pending form into a real application record."""
	raw = frappe.request.get_data() or b""
	signature = (
		frappe.get_request_header("X-Jokoor-Signature")
		or frappe.get_request_header("Jokoor-Signature")
		or ""
	)

	settings = _get_settings()
	secret = settings.get_password("jokoor_webhook_secret", raise_exception=False) or ""

	if not _verify_signature(raw, signature, secret):
		frappe.local.response.http_status_code = 401
		return {"ok": False, "error": "invalid signature"}

	try:
		event = json.loads(raw.decode("utf-8") or "{}")
	except Exception:
		frappe.local.response.http_status_code = 400
		return {"ok": False, "error": "invalid json"}

	data = event.get("data") or event
	event_type = (event.get("type") or event.get("event") or "").lower()
	status_raw = (data.get("status") or "").lower()
	checkout_id = data.get("id") or data.get("checkout_id")

	if not checkout_id:
		frappe.log_error(message=json.dumps(event)[:1000], title="Jokoor webhook: no checkout id")
		return {"ok": True, "ignored": True}

	is_success = status_raw in ("succeeded", "completed", "paid") or "success" in event_type or "completed" in event_type
	is_failed = status_raw == "failed" or "failed" in event_type
	is_cancelled = status_raw in ("cancelled", "canceled", "expired") or "cancel" in event_type

	if is_success:
		name = _materialize_from_pending(checkout_id, data, settings)
		frappe.db.commit()
		return {"ok": True, "name": name}

	if is_failed or is_cancelled:
		# Nothing to materialize; just drop the pending row if present.
		pending = frappe.db.get_value("GPU Pending Application", {"checkout_id": checkout_id}, "name")
		if pending:
			frappe.delete_doc("GPU Pending Application", pending, ignore_permissions=True, force=True)
			frappe.db.commit()
		return {"ok": True, "dropped": bool(pending)}

	return {"ok": True, "ignored": True}
