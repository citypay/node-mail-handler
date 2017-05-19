# AWS SES Mail Handler

Used to send email via AWS SES using recaptcha and email validation.

The process uses an incoming event packet that triggers data to be sent to an email
address only if the recaptcha process is a success. This prevents CSRF issues and
ensures that a robot didn't execute the call.
 
```javascript
let data = {
    // used to verify the request
    recaptcha: {
        response: "",
        secret: ""
    },
    mail: [{
        to: [ "lambda@foo.com" ],
        cc: [],
        bcc: [],
        subject: "Test From Lambda Code",
        body: "<p>I may contain html!? <h2>adsfa</h2>",
        from: "lambda@bar.com"
    }]
};
```

| Key | Required | Description |
|-----|---|-------------|
| recaptcha.response | required | The response packet from Google for a reCAPTCHA process using node-recaptcha. |
| recaptcha.secret   | required | The secret value provided by Google for reCAPTCHA |
| mail               | required | An array of mail items which are sent via the script. Multiple emails can be sent by the handler process. |
| mail.[n].from      | required | The sender o the email |
| mail.[n].to        | required | An array of addresses to send the email to |
| mail.[n].subject   | required | The subject of the email |
| mail.[n].body      | required | The body of the email to send. |
| mail.[n].cc        | optional | An array of addresses to cc the email to |
| mail.[n].bcc       | optional | An array of addresses to bcc the email to |
| mail.[n].replyTo   | optional | The reply-to header of the email |


If the body starts with a html tag, the email is treated as a HTML email otherwise 
it is sent as plain text. 

## Brandability

Branding can be co-ordinated using a configurable structure for emails. This can be added by
presenting a branding property on the root of the incoming data that refers to 

- _name_ - a name given to the brand such as your company name. Naming allows for multiple styles of brand to be applied for different emails
- _css_ - a css style sheet which can be used and embedded in the style section of the email
- _header_ a header which is inserted at the top of the email
- _footer_ a footer which is appended to the bottom of the email

```javascript
let data = {
    branding: [
        {
            "name": "brand1",
            "css": "assets/style.css",
            "header": "assets/header.html",
            "footer": "assets/footer.html"
        }
    ]
    ...
    }
```

To set the brand of the email you will aslo need to add either 
1. a brand reference in each mail property

```javascript
let data = {
    mail: [{
        to: [ "lambda@foo.com" ],
        // mail level brand
        brand: "brand1",
        ...

```

or
2. a brand reference in the root property

```javascript
let data = {
    // global level brand
    brand: "brand1"
    ...

```