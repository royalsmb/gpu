import frappe
from frappe.model.document import Document


class GPUSettings(Document):
	def get_active_api_key(self):
		if not self.jokoor_enabled:
			return None
		if (self.jokoor_mode or "Test") == "Live":
			return self.get_password("jokoor_live_api_key", raise_exception=False)
		return self.get_password("jokoor_test_api_key", raise_exception=False)
