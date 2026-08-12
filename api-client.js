(function () {
  let accessToken = sessionStorage.getItem("accessToken") || "";

  async function request(path, options = {}) {
    const isFormData = options.body instanceof FormData;
    const response = await fetch(`/api${path}`, {
      credentials: "include",
      ...options,
      headers: {
        ...(!isFormData ? { "Content-Type": "application/json" } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      let errorMessage =
        (typeof data?.error === "string" ? data.error : data?.error?.message) ||
        data?.message ||
        "The request could not be completed.";

      if (data?.error?.details?.fieldErrors) {
        const fields = Object.entries(data.error.details.fieldErrors)
          .map(([field, msgs]) => `${field}: ${Array.isArray(msgs) ? msgs.join(", ") : msgs}`)
          .join("; ");
        if (fields) {
          errorMessage += ` (${fields})`;
        }
      }

      const error = new Error(errorMessage);
      error.status = response.status;
      error.code = typeof data?.error === "object" ? data?.error?.code : undefined;
      error.details = typeof data?.error === "object" ? data?.error?.details : undefined;
      throw error;
    }
    return data;
  }

  function uploadMultipart(path, formData, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api${path}`);
      xhr.withCredentials = true;
      if (accessToken) xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable && onProgress) onProgress(Math.round((event.loaded / event.total) * 100));
      });
      xhr.addEventListener("load", () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText || "{}"); } catch {}
        if (xhr.status >= 200 && xhr.status < 300) return resolve(data);
        reject(new Error(data.error?.message || "The upload could not be completed."));
      });
      xhr.addEventListener("error", () => reject(new Error("The upload could not reach the clinic server.")));
      xhr.send(formData);
    });
  }

  async function downloadPrivateReport(id) {
    const response = await fetch(`/api/reports/${encodeURIComponent(id)}/download`, {
      credentials: "include",
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error?.message || "The medical report could not be downloaded.");
    }
    return { blob: await response.blob(), disposition: response.headers.get("content-disposition") || "" };
  }

  window.api = {
    getToken: () => accessToken,
    setToken(value) {
      accessToken = value || "";
      if (value) sessionStorage.setItem("accessToken", value);
      else sessionStorage.removeItem("accessToken");
    },
    login: (body) => request("/auth/login", { method: "POST", body: JSON.stringify(body) }),
    logout: () => request("/auth/logout", { method: "POST" }),
    me: () => request("/auth/me"),
    staffUsers: () => request("/auth/users"),

    // Locations & Availability
    locations: () => request("/clinic-locations/public"),
    clinics: () => request("/clinics"),
    bookableLocations: () => request("/clinic-locations/bookable"),
    cities: () => request("/availability/cities"),
    dates: (locationId = "BWP") => request(`/availability/dates?locationId=${encodeURIComponent(locationId)}`),
    slots: (locationId = "BWP", date) => request(`/availability/slots?locationId=${encodeURIComponent(locationId)}&date=${encodeURIComponent(date)}`),
    blockDate: (body) => request("/availability/block-date", { method: "POST", body: JSON.stringify(body) }),
    unblockDate: (body) => request("/availability/unblock-date", { method: "POST", body: JSON.stringify(body) }),
    blockSlot: (body) => request("/availability/block-slot", { method: "POST", body: JSON.stringify(body) }),
    unblockSlot: (body) => request("/availability/unblock-slot", { method: "POST", body: JSON.stringify(body) }),
    getManagedSchedule: (locationId = "BWP") => request(`/availability/manage/${encodeURIComponent(locationId)}`),
    updateSchedule: (body) => request("/availability/schedule", { method: "PUT", body: JSON.stringify(body) }),

    // Doctor Profile
    getDoctorProfile: () => request("/doctors/dr-sohaib"),
    updateDoctorProfile: (body) => request("/doctors/dr-sohaib", { method: "PUT", body: JSON.stringify(body) }),

    // Appointments
    book: (body, idempotencyKey) => request("/appointments", { method: "POST", headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}, body: JSON.stringify(body) }),
    manualBook: (body, idempotencyKey) => request("/appointments/manual", { method: "POST", headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}, body: JSON.stringify(body) }),
    lookup: (body) => request("/appointments/lookup", { method: "POST", body: JSON.stringify(body) }),
    searchAppointment: (body) => request("/appointments/lookup", { method: "POST", body: JSON.stringify(body) }),
    reschedule: (body) => request("/appointments/reschedule", { method: "POST", body: JSON.stringify(body) }),
    cancel: (body) => request("/appointments/cancel", { method: "POST", body: JSON.stringify(body) }),
    earlierSlot: (body) => request("/appointments/earlier-slot", { method: "POST", body: JSON.stringify(body) }),
    confirmAppointment: (id, body) => request(`/appointments/${id}/confirm`, { method: "POST", body: JSON.stringify(body) }),
    rescheduleAppointment: (id, body) => request(`/appointments/${id}/reschedule`, { method: "POST", body: JSON.stringify(body) }),
    cancelAppointment: (id, body) => request(`/appointments/${id}/cancel`, { method: "POST", body: JSON.stringify(body) }),
    requestEarlierAppointment: (id, body) => request(`/appointments/${id}/request-earlier`, { method: "POST", body: JSON.stringify(body) }),
    appointments: (query = "") => request(`/appointments${query ? "?" + query : ""}`),
    getAppointmentById: (id) => request(`/appointments/${id}`),
    updateAppointmentStatus: (id, status) => request(`/appointments/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
    
    // Reports
    uploadReport: (formData, onProgress) => uploadMultipart("/reports/upload", formData, onProgress),
    downloadReport: (id) => downloadPrivateReport(id),
    deleteReport: (id) => request(`/reports/${encodeURIComponent(id)}`, { method: "DELETE" }),
    listReports: (query = "") => request(`/reports${query ? "?" + query : ""}`),
    getReportById: (id) => request(`/reports/${id}`),
    getReportsByAppointment: (appointmentId) => request(`/reports/appointment/${encodeURIComponent(appointmentId)}`),
    updateReportStatus: (id, status) => request(`/reports/${id}/status`, { method: "PUT", body: JSON.stringify({ status }) }),

    // Consultations
    requestConsultation: (body) => request("/online-consultations", { method: "POST", body: JSON.stringify(body) }),
    listConsultations: (query = "") => request(`/online-consultations${query ? "?" + query : ""}`),
    getConsultationById: (id) => request(`/online-consultations/${id}`),
    updateConsultation: (id, data) => request(`/online-consultations/${id}/status`, { method: "PUT", body: JSON.stringify(data) }),

    // Emergencies
    sendEmergencyAlert: (body) => request("/emergency-alerts", { method: "POST", body: JSON.stringify(body) }),
    listEmergencyAlerts: (query = "") => request(`/emergency-alerts${query ? "?" + query : ""}`),
    resolveEmergencyAlert: (id, resolutionNotes) => request(`/emergency-alerts/${id}/resolve`, { method: "PATCH", body: JSON.stringify({ resolutionNotes }) }),

    // Staff Conversations / Handover
    createConversation: (body) => request("/conversations", { method: "POST", body: JSON.stringify(body) }),
    getConversations: () => request("/conversations"),
    listConversations: () => request("/conversations"),
    getConversation: (id) => request(`/conversations/${id}`),
    getConversationById: (id) => request(`/conversations/${id}`),
    sendMessage: (id, body) => request(`/conversations/${id}/messages`, { method: "POST", body: JSON.stringify(body) }),
    sendConversationMessage: (id, body) => request(`/conversations/${id}/messages`, { method: "POST", body: JSON.stringify(body) }),
    takeoverConversation: (id) => request(`/conversations/${id}/takeover`, { method: "POST" }),
    conversationTakeover: (id) => request(`/conversations/${id}/takeover`, { method: "POST" }),
    reactivateAi: (id) => request(`/conversations/${id}/reactivate-ai`, { method: "POST" }),
    conversationReactivateAi: (id) => request(`/conversations/${id}/reactivate-ai`, { method: "POST" }),

    // WhatsApp Simulation
    simulateMessage: (body) => request("/whatsapp/simulate-message", { method: "POST", body: JSON.stringify(body) }),
    whatsappConversations: () => request("/whatsapp/conversations"),
    whatsappMessages: (phone) => request(`/whatsapp/conversations/${encodeURIComponent(phone)}/messages`),

    // Patients
    patients: (query = "") => request(`/patients${query ? "?" + query : ""}`),
    patientDetails: (id) => request(`/patients/${id}`),
    addPatientNote: (id, note) => request(`/patients/${id}/notes`, { method: "POST", body: JSON.stringify({ note }) }),

    // Reminders
    reminders: (query = "") => request(`/reminders${query ? "?" + query : ""}`),
    scheduleFollowUp: (body) => request("/reminders/follow-up", { method: "POST", body: JSON.stringify(body) }),
    updateReminderStatus: (id, status) => request(`/reminders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
    retryReminder: (id) => request(`/reminders/${id}/retry`, { method: "POST" }),

    getAppointmentConsent: () => request("/appointments/consent"),
    recordConsentDecision: (body) => request("/appointments/consent/decision", { method: "POST", body: JSON.stringify(body) }),

    // Dashboard APIs
    dashboard: () => request("/dashboard"),
    dashboardSummary: (locationId = "", date = "") => request(`/dashboard/summary?${new URLSearchParams({ ...(locationId ? { locationId } : {}), ...(date ? { date } : {}) })}`),
    dashboardRecentAppointments: () => request("/dashboard/recent-appointments"),
    dashboardRecentReports: () => request("/dashboard/recent-reports"),
    dashboardRecentConsultations: () => request("/dashboard/recent-consultations"),
    dashboardEmergencyAlerts: () => request("/dashboard/emergency-alerts"),

    // Settings & Audit Logs & Health
    getClinicSettings: () => request("/settings/clinic"),
    updateClinicSettings: (body) => request("/settings/clinic", { method: "PUT", body: JSON.stringify(body) }),
    getAuditLogs: () => request("/settings/audit-logs"),
    getHealth: () => request("/health"),
    getEmailHealth: () => request("/health/email")
  };
}());
