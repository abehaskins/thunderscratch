import * as crypto from "crypto";
import * as functions from "firebase-functions";

class MailgunConfig {
  apiKey: string;
  domain: string;

  /*
  Helper class to uppercase the "k" in "apiKey"
  */
  constructor(config: {apikey: string, domain: string}) {
    this.apiKey = config.apikey;
    this.domain = config.domain;
  }
}

export interface Person {
    address: string;
    name?: string;
    subscribed?: boolean;
    vars?: any;
}

export interface PersonList {
    items: Person[];
    total_count: number;
}

export interface Email {
    from: string;
    to: string;
    subject: string;
    text: string;
}

const mailgunConfig: MailgunConfig = new MailgunConfig(functions.config().mailgun);
const mailgun = require("mailgun-js")(mailgunConfig);

class GeneralConfig {
  verification_secret: string;
}

export const email = {
  subscriber_count: functions.https.onRequest(async (request, response) => {
    const list = mailgun.lists(`everyone@${mailgunConfig.domain}`);

    const members = await list.members().list() as PersonList;
    response.send(members.total_count);
  }),
  send_verification: functions.https.onRequest(async (request, response) => {
    const email_address = request.query["email"];
    const verification_code = utils.createVerificationCode(request.query["email"]);
    const verification_function_id = utils.getFunctionID("email", "verify_email");
    const verification_url =
      `https://us-central1-${process.env.GCLOUD_PROJECT}.cloudfunctions.net/${verification_function_id}?code=${verification_code}`;

    const email: Email = {
      from: `bot@${mailgunConfig.domain}`,
      to: email_address,
      subject: `Comfirm Subscription to ${mailgunConfig.domain}`,
      text: `Click this link (${verification_url}) to confirm your subscription.`
    };

    const sent = await mailgun.messages().send(email);
    response.send(sent);
  }),
  verify_email: functions.https.onRequest(async (request, response) => {
    const list = mailgun.lists(`everyone@${mailgunConfig.domain}`);
    const email_address = utils.readVerificationCode(request.query["code"]);

    mailgun.validate(email_address)
      .then((body) => {
        if (body && body.is_valid) {
          return list.members().create({address: email_address} as Person);
        } else {
          return `Invalid code.`;
        }
      })
      .then((body) => {
        response.send(body);
      })
      .catch((err) => {
        response.send(err);
      });
  })
};

const utils = {
  createVerificationCode(email_address: string): string {
    const gc: GeneralConfig = functions.config().general as GeneralConfig;
    const cipher = crypto.createCipher("aes-256-ctr", gc.verification_secret);

    return cipher.update(email_address, "utf8", "hex") + cipher.final("hex");
  },
  readVerificationCode(code: string): string {
    const gc: GeneralConfig = functions.config().general as GeneralConfig;
    const decipher = crypto.createDecipher("aes-256-ctr", gc.verification_secret);

    return decipher.update(code, "hex") + decipher.final("utf8");
  },
  getFunctionID(...parts: string[]) {
    return parts.join("-");
  }
};