# <img src="https://raw.githubusercontent.com/kintesh/containerise/master/static/icons/icon.png" alt="Drawing" width="42" align="top"/> containerise

Firefox extension to automatically open websites in a container

|![](https://raw.githubusercontent.com/kintesh/containerise/master/static/screenshots/1.png)  |  ![](https://raw.githubusercontent.com/kintesh/containerise/master/static/screenshots/2.png)  |  ![](https://raw.githubusercontent.com/kintesh/containerise/master/static/screenshots/3.png)  |  ![](https://raw.githubusercontent.com/kintesh/containerise/master/static/screenshots/4.png)|
| --- | --- | --- | --- |
|Select your container and add a domain to always open all visits in the chosen container. | Add many domains as you wish. | Special `No Container` option to break out of a container. | Simple CSV based mapping of a domain to a container by name for easy backup and bulk editing. |


# Installation
Install the latest release for Firefox from [AMO](https://addons.mozilla.org/en-US/firefox/addon/containerise/)



# Usage

## Basic mapping

`amazon.co.uk, Shopping` will open all amazon.co.uk (not subdomains) links in Shopping container.

## Glob
`!*.amazon.co.uk, Shopping`  will be treated as `*.amazon.co.uk` glob pattern. (suitable to subdomains)

## Regex

`@.+\.amazon\.co\.uk$, Shopping` will be treat as `.+\.amazon\.co\.uk$` regex. (suitable to subdomains and complex paths)



# Enterprise managed rules

Firefox enterprise policy can supply rules that the popup will not edit. The policy key is `3rdparty.Extensions.<extension id>`. Firefox copies that object into `browser.storage.managed`. No `managed_schema.json` is required. A change to the policy applies after the browser restarts.

The extension id shipped here is `containerise@kinte.sh`. A fork has to use its own id in the manifest, and the policy key has to be that same id. This repository does not change the id.

```json
{
  "policies": {
    "3rdparty": {
      "Extensions": {
        "containerise@kinte.sh": {
          "rules": [
            {"host": "example.com", "container": "Work"},
            {"host": "!*.example.org", "container": "Work"},
            {"host": "@.+\\.example\\.net$", "container": "Personal"}
          ]
        }
      }
    }
  }
}
```

`host` uses the same syntax as a rule typed in the popup: a plain host, a glob prefixed with `!`, or a regular expression prefixed with `@`. `container` is the container's name, not its cookie store id. `No Container` leaves the site in the default cookie store. If a named container does not exist yet, it is created. Managed rules are not written into the extension's own storage. Where a managed rule and a user rule use the same host, the managed rule wins. A more specific user rule can still match ahead of a broader managed rule. If the policy lists the same host twice, the later entry wins.

On NixOS, `programs.firefox.policies` is that `policies` object:

```nix
programs.firefox.policies."3rdparty".Extensions."containerise@kinte.sh".rules = [
  {
    host = "example.com";
    container = "Work";
  }
  {
    host = "!*.example.org";
    container = "Work";
  }
  {
    host = "@.+\\.example\\.net$";
    container = "Personal";
  }
];
```

Managed rules are shown locked in the popup and as a read-only list in the CSV editor. Saving either one leaves them unchanged.



# Development

## Available Scripts
In the project directory, you can run:

#### `npm ci`
Installs required dependencies. 

#### `npm run webpack`
Starts webpack with `--watch` option and outputs to `./build` directory.
 
#### `npm run build`
Builds the extension for production use.<br>

#### `npm run test`
Runs test specs using jest.
Use `test:watch` to watch for edits and re-run the tests.

#### `npm run lint`
Lint using eslint.

#### `npm run web-ext`
Runs web-ext process to debug the extension on Firefox. See [web-ext docs](https://github.com/mozilla/web-ext) <br/>
To live reload the extension, start this process in a new tab after starting `npm run webpack` process.
