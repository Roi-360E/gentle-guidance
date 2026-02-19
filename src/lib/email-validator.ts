// Blocklist of known disposable/temporary email domains
const DISPOSABLE_DOMAINS: string[] = [
  // Major disposable email services
  "guerrillamail.com", "guerrillamail.net", "guerrillamail.org", "guerrillamail.de",
  "tempmail.com", "temp-mail.org", "temp-mail.io", "tempail.com",
  "10minutemail.com", "10minutemail.net", "10minmail.com",
  "throwaway.email", "throwaway.com",
  "mailinator.com", "mailinator.net", "mailinator2.com",
  "yopmail.com", "yopmail.fr", "yopmail.net",
  "sharklasers.com", "guerrillamailblock.com", "grr.la", "pokemail.net",
  "spam4.me", "spamgourmet.com", "spamgourmet.net",
  "trashmail.com", "trashmail.net", "trashmail.me", "trashmail.org",
  "dispostable.com", "maildrop.cc", "mailnesia.com",
  "getnada.com", "nada.email", "nada.ltd",
  "mohmal.com", "mohmal.im", "mohmal.in",
  "fakeinbox.com", "fakebox.org",
  "emailondeck.com", "emailfake.com",
  "crazymailing.com", "crazy.email",
  "mailcatch.com", "mail-temporaire.com",
  "jetable.org", "jetable.com",
  "mytemp.email", "tempinbox.com",
  "discard.email", "discardmail.com", "discardmail.de",
  "harakirimail.com", "mailexpire.com",
  "tempmailer.com", "tempmailaddress.com",
  "burnermail.io", "inboxbear.com",
  "mintemail.com", "mt2015.com",
  "thankyou2010.com", "trash-me.com",
  "wegwerfmail.de", "wegwerfmail.net", "wegwerfmail.org",
  "wh4f.org", "tmail.ws",
  "mailnull.com", "mailscrap.com",
  "deadaddress.com", "despammed.com",
  "spamfree24.org", "spammotel.com",
  "mailzilla.com", "mailzilla.org",
  "emkei.cz", "anonymbox.com",
  "cool.fr.nf", "courriel.fr.nf",
  "speed.1s.fr", "jetable.fr.nf",
  "nospam.ze.tc", "kurzepost.de",
  "objectmail.com", "proxymail.eu",
  "rcpt.at", "trash-mail.at",
  "trashymail.com", "trashymail.net",
  "upliftnow.com", "vpn.st",
  "wasabi.in", "wuzup.net",
  "xagloo.com", "ypmail.webarnak.fr.eu.org",
  "yuurok.com", "zehnminutenmail.de",
  "tempsky.com", "tempomail.fr",
  "temporaryemail.net", "temporaryemail.us",
  "temporaryforwarding.com", "temporaryinbox.com",
  "temporarymailaddress.com", "tempr.email",
  "tempthe.net", "thankdog.net",
  "thisisnotmyrealemail.com", "throam.com",
  "tittbit.in", "tmail.ws",
  "tmpmail.net", "tmpmail.org",
  "toiea.com", "toomail.biz",
  "topranklist.de", "tradermail.info",
  "turual.com", "twinmail.de",
  "tyldd.com", "uggsrock.com",
  "umail.net", "upliftnow.com",
  "venompen.com", "veryreallyfakeemails.com",
  "viditag.com", "viewcastmedia.com",
  "vomoto.com", "vpn.st",
  "vsimcard.com", "vubby.com",
  "wasteland.rfc822.org", "webemail.me",
  "weg-werf-email.de", "wegwerfadresse.de",
  "wegwerfemail.com", "wegwerfmail.de",
  "wetrainbayarea.com", "wetrainbayarea.org",
  "wilemail.com", "willhackforfood.biz",
  "willselfdestruct.com", "winemaven.info",
  "wronghead.com", "wuzup.net",
  "wuzupmail.net", "wwwnew.eu",
  "xagloo.com", "xemaps.com",
  "xents.com", "xjoi.com",
  "xmaily.com", "xoxy.net",
  "mailtemp.net", "mail-temp.com",
  "getairmail.com", "filzmail.com",
  "dropmail.me", "disbox.net",
  "correotemporal.org", "chacuo.net",
  "binkmail.com", "armyspy.com",
  "anonbox.net", "altmails.com",
  "020.co.uk", "123.com",
  "bouncr.com", "byom.de",
  "chammy.info", "dayrep.com",
  "dcemail.com", "einrot.com",
  "emailigo.de", "emailisvalid.com",
  "emailresort.com", "emailsensei.com",
  "emailtemporario.com.br", "ephemail.net",
  "etranquil.com", "etranquil.net",
  "evopo.com", "explodemail.com",
  "express.net.ua", "eyepaste.com",
  "fastacura.com", "filzmail.com",
  "fixmail.tk", "fleckens.hu",
  "flyspam.com", "frapmail.com",
  "front14.org", "fux0ringduh.com",
  "gelitik.in", "getonemail.com",
  "getonemail.net", "girlsundertheinfluence.com",
  "gishpuppy.com", "grandmamail.com",
  "grandmasmail.com", "great-host.in",
  "greensloth.com", "haltospam.com",
  "hotpop.com", "ieatspam.eu",
  "ieatspam.info", "imails.info",
  "inbound.plus", "incognitomail.com",
  "incognitomail.net", "incognitomail.org",
  "insorg-mail.info", "ipoo.org",
  "irish2me.com", "iwi.net",
  "jetable.com", "jetable.net",
  "jnxjn.com", "joelpet.com",
  "klassmaster.com", "klassmaster.net",
  "klzlk.com", "koszmail.pl",
  "kurzepost.de", "lawlita.com",
  "letthemeatspam.com", "lhsdv.com",
  "lifebyfood.com", "link2mail.net",
  "litedrop.com", "lol.ovpn.to",
  "lookugly.com", "lopl.co.cc",
  "lortemail.dk", "lovemeleaveme.com",
  "lr7.us", "lr78.com",
  "lroid.com", "lukop.dk",
  "maboard.com", "mail-filter.com",
  "mail-temporaire.fr", "mail.by",
  "mail.mezimages.net", "mail.zp.ua",
  "mail2rss.org", "mail333.com",
  "mailbidon.com", "mailblocks.com",
  "mailbucket.org", "mailcat.biz",
  "mailcatch.com", "mailde.de",
  "mailde.info", "maildx.com",
  "maileater.com", "mailexpire.com",
  "mailfa.tk", "mailforspam.com",
  "mailfree.ga", "mailfree.gq",
  "mailfree.ml", "mailfreeonline.com",
  "mailfs.com", "mailguard.me",
  "mailhazard.com", "mailhazard.us",
  "mailhz.me", "mailimate.com",
  "mailin8r.com", "mailinater.com",
  "mailinator.co.uk", "mailinator.gq",
  "mailinator.us", "mailincubator.com",
  "mailismagic.com", "mailjunk.cf",
  "mailjunk.ga", "mailjunk.gq",
  "mailjunk.ml", "mailjunk.tk",
  "mailmate.com", "mailme.ir",
  "mailme.lv", "mailme24.com",
  "mailmetrash.com", "mailmoat.com",
  "mailms.com", "mailnator.com",
  "mailnull.com", "mailorg.org",
  "mailpick.biz", "mailproxsy.com",
  "mailrock.biz", "mailsac.com",
  "mailseal.de", "mailshell.com",
  "mailsiphon.com", "mailslite.com",
  "mailtemp.info", "mailtothis.com",
  "mailtrash.net", "mailtv.net",
  "mailtv.tv", "mailzilla.com",
  "makemetheking.com", "manifestgenerator.com",
  "mega.zik.dj",
];

// Whitelist of trusted email providers
const TRUSTED_DOMAINS: string[] = [
  // Google
  "gmail.com", "googlemail.com",
  // Microsoft
  "outlook.com", "outlook.com.br", "hotmail.com", "hotmail.com.br",
  "live.com", "live.com.br", "msn.com",
  // Yahoo
  "yahoo.com", "yahoo.com.br", "ymail.com",
  // Apple
  "icloud.com", "me.com", "mac.com",
  // ProtonMail
  "protonmail.com", "proton.me", "pm.me",
  // Brazilian providers
  "uol.com.br", "bol.com.br", "terra.com.br", "ig.com.br",
  "globo.com", "globomail.com", "r7.com",
  // Other major providers
  "zoho.com", "zohomail.com",
  "aol.com",
  "mail.com",
  "gmx.com", "gmx.net",
  "fastmail.com", "fastmail.fm",
  "tutanota.com", "tuta.io",
];

export type EmailValidationResult = {
  valid: boolean;
  reason?: string;
};

export function validateEmailDomain(email: string): EmailValidationResult {
  const domain = email.split("@")[1]?.toLowerCase();

  if (!domain) {
    return { valid: false, reason: "Email inválido" };
  }

  // Check blocklist
  if (DISPOSABLE_DOMAINS.includes(domain)) {
    return { valid: false, reason: "Emails temporários não são permitidos. Use um email real (Gmail, Outlook, etc.)" };
  }

  // Check whitelist
  if (!TRUSTED_DOMAINS.includes(domain)) {
    return { valid: false, reason: "Provedor de email não aceito. Use Gmail, Outlook, Yahoo, iCloud ou outro provedor confiável." };
  }

  return { valid: true };
}

export { DISPOSABLE_DOMAINS, TRUSTED_DOMAINS };
