const escapeHtml = (value) => {
  const node = document.createElement("span");
  node.textContent = value ?? "";
  return node.innerHTML;
};

function messageId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function openTalentContactDialog({
  supabase,
  freelancerUserId,
  displayName,
  professionalTitle = "",
  onConversation,
}) {
  if (!supabase || !freelancerUserId) return;

  const previousFocus = document.activeElement;
  const backdrop = document.createElement("div");
  backdrop.className = "talent-dialog-backdrop";
  backdrop.innerHTML = `
    <section class="talent-dialog talent-contact-dialog" role="dialog" aria-modal="true" aria-labelledby="talent-contact-title">
      <button class="talent-dialog-close" type="button" aria-label="Close message dialog">×</button>
      <span>Client introduction</span>
      <h2 id="talent-contact-title">Message ${escapeHtml(displayName || "this professional")}</h2>
      <p>
        Introduce the work you have in mind. This private conversation will include only you and
        ${escapeHtml(displayName || "the freelancer")}.
      </p>
      ${professionalTitle ? `<p class="talent-contact-role">${escapeHtml(professionalTitle)}</p>` : ""}
      <form>
        <label>
          Your message
          <textarea minlength="20" maxlength="5000" required>Hi ${escapeHtml(displayName || "there")}, I found your GoWorkora profile and would like to discuss a project that may fit your experience.</textarea>
        </label>
        <p class="talent-error" role="alert" hidden></p>
        <div>
          <button type="button" data-contact-cancel>Cancel</button>
          <button class="btn btn-dark" type="submit">Start conversation</button>
        </div>
      </form>
    </section>
  `;
  document.body.append(backdrop);

  const close = () => {
    document.removeEventListener("keydown", onKeydown);
    backdrop.remove();
    previousFocus?.focus?.();
  };
  const onKeydown = (event) => {
    if (event.key === "Escape") close();
  };
  document.addEventListener("keydown", onKeydown);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) close();
  });
  backdrop.querySelector(".talent-dialog-close").addEventListener("click", close);
  backdrop.querySelector("[data-contact-cancel]").addEventListener("click", close);

  const textarea = backdrop.querySelector("textarea");
  textarea.focus();
  textarea.select();

  backdrop.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = event.submitter;
    const errorBox = backdrop.querySelector(".talent-error");
    submit.disabled = true;
    submit.textContent = "Starting…";
    errorBox.hidden = true;

    const result = await supabase.rpc("start_talent_conversation", {
      p_freelancer_user_id: freelancerUserId,
      p_message: textarea.value.trim(),
      p_client_generated_id: messageId(),
    });

    if (result.error) {
      errorBox.textContent = "The conversation could not be started. Confirm the profile is still public and try again.";
      errorBox.hidden = false;
      submit.disabled = false;
      submit.textContent = "Start conversation";
      return;
    }

    const conversationId = result.data;
    close();
    if (onConversation) onConversation(conversationId);
    else if (conversationId) location.hash = `messages/${conversationId}`;
  });
}
