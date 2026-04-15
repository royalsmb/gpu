import hashlib
import hmac
import json

import frappe
import requests
from frappe import _
from frappe.utils import flt, get_url, now_datetime


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


def _create_jokoor_checkout(doc, settings):
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
		"reference": doc.name,
		"customer_name": doc.applicant_name,
		"customer_email": doc.email,
		"customer_phone": doc.mobile,
		"success_url": f"{success_url}&ref={doc.name}" if "?" in success_url else f"{success_url}?ref={doc.name}",
		"failure_url": f"{failure_url}&ref={doc.name}" if "?" in failure_url else f"{failure_url}?ref={doc.name}",
		"metadata": {
			"application_name": doc.name,
			"applicant_name": doc.applicant_name,
			"doctype": "Gambia Press Union",
		},
		"idempotency_key": f"gpu-app-{doc.name}",
	}
	if payment_methods:
		payload["payment_method_types"] = payment_methods

	try:
		resp = requests.post(
			f"{base_url}/checkouts",
			json=payload,
			headers={
				"Authorization": f"Bearer {api_key}",
				"Content-Type": "application/json",
			},
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

	data = (resp.json() or {}).get("data") or {}
	return data


@frappe.whitelist(allow_guest=True)
def submit_application(**data):
	"""Public endpoint the React form posts to. Creates the application and
	(if Jokoor is enabled) returns a payment URL for the applicant to pay the fee."""
	payload = frappe._dict(data)

	experience = _clean_rows(
		payload.get("experience"),
		["institution_name", "address", "start_date", "end_date"],
	)
	tertiary = _clean_rows(
		payload.get("tertiary_education"),
		["institution", "address", "course_name", "duration", "date_graduated", "qualification"],
	)
	referees = _clean_rows(
		payload.get("referees"),
		["referee_name", "address", "phone_number", "place_of_work", "position"],
	)

	doc = frappe.get_doc({
		"doctype": "Gambia Press Union",
		"applicant_name": payload.get("applicant_name"),
		"sex": payload.get("sex"),
		"date_of_birth": payload.get("date_of_birth"),
		"place_of_birth": payload.get("place_of_birth"),
		"residence": payload.get("residence"),
		"nationality": payload.get("nationality"),
		"mobile": payload.get("mobile"),
		"email": payload.get("email"),
		"emergency_contact_name": payload.get("emergency_contact_name"),
		"emergency_relationship": payload.get("emergency_relationship"),
		"emergency_address": payload.get("emergency_address"),
		"emergency_phone": payload.get("emergency_phone"),
		"emergency_email": payload.get("emergency_email"),
		"media_house": payload.get("media_house"),
		"employer_address": payload.get("employer_address"),
		"employer_tel": payload.get("employer_tel"),
		"employer_email": payload.get("employer_email"),
		"publisher": payload.get("publisher"),
		"employer_start_date": payload.get("employer_start_date"),
		"current_position": payload.get("current_position"),
		"senior_school": payload.get("senior_school"),
		"senior_year_completed": payload.get("senior_year_completed"),
		"senior_qualification": payload.get("senior_qualification"),
		"declaration_signature": payload.get("declaration_signature"),
		"declaration_date": payload.get("declaration_date"),
		"agreed": 1 if payload.get("agreed") in (1, "1", True, "true", "on") else 0,
		"status": "Pending",
		"payment_status": "Not Required",
		"experience": experience,
		"tertiary_education": tertiary,
		"referees": referees,
	})
	doc.flags.ignore_permissions = True
	doc.insert(ignore_permissions=True)

	settings = _get_settings()
	fee = flt(settings.application_fee)
	response = {
		"name": doc.name,
		"applicant_name": doc.applicant_name,
		"payment_required": False,
	}

	if settings.jokoor_enabled and fee > 0:
		checkout = _create_jokoor_checkout(doc, settings)
		doc.db_set("checkout_id", checkout.get("id"), update_modified=False)
		doc.db_set("payment_url", checkout.get("payment_url"), update_modified=False)
		doc.db_set("payment_status", "Pending", update_modified=False)
		response.update({
			"payment_required": True,
			"payment_url": checkout.get("payment_url"),
			"checkout_id": checkout.get("id"),
			"amount": checkout.get("amount"),
			"currency": checkout.get("currency"),
		})

	frappe.db.commit()
	return response


@frappe.whitelist(allow_guest=True)
def check_payment(name):
	"""Lightweight status check the React success page can poll."""
	doc = frappe.db.get_value(
		"Gambia Press Union",
		name,
		["applicant_name", "payment_status", "amount_paid", "paid_at"],
		as_dict=True,
	)
	if not doc:
		frappe.throw(_("Application not found."), frappe.DoesNotExistError)
	return doc


def _verify_signature(raw_body: bytes, signature: str, secret: str) -> bool:
	if not secret:
		return True
	if not signature:
		return False
	expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
	# Accept both "sha256=…" and bare hex.
	candidate = signature.split("=", 1)[-1].strip()
	return hmac.compare_digest(expected, candidate)


@frappe.whitelist(allow_guest=True)
def jokoor_webhook():
	"""Receives checkout status updates from Jokoor and marks the application
	as Paid / Failed / Cancelled accordingly."""
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

	# Resolve the application by reference / metadata / checkout id.
	reference = (
		data.get("reference")
		or (data.get("metadata") or {}).get("application_name")
	)
	checkout_id = data.get("id") or data.get("checkout_id")

	name = None
	if reference and frappe.db.exists("Gambia Press Union", reference):
		name = reference
	elif checkout_id:
		name = frappe.db.get_value("Gambia Press Union", {"checkout_id": checkout_id}, "name")

	if not name:
		frappe.log_error(message=json.dumps(event)[:1000], title="Jokoor webhook: unknown reference")
		return {"ok": True, "ignored": True}

	doc = frappe.get_doc("Gambia Press Union", name)

	status_raw = (data.get("status") or "").lower()
	if status_raw in ("succeeded", "completed", "paid") or "success" in event_type or "completed" in event_type:
		doc.db_set({
			"payment_status": "Paid",
			"transaction_id": (data.get("transaction") or {}).get("id") or data.get("transaction_id") or data.get("id"),
			"amount_paid": flt(data.get("amount") or settings.application_fee),
			"paid_at": now_datetime(),
		}, update_modified=False)
	elif status_raw in ("failed",) or "failed" in event_type:
		doc.db_set("payment_status", "Failed", update_modified=False)
	elif status_raw in ("cancelled", "canceled", "expired") or "cancel" in event_type:
		doc.db_set("payment_status", "Cancelled", update_modified=False)

	frappe.db.commit()
	return {"ok": True, "name": name}
