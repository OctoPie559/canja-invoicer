## These are the underlying issues that I found while testing out our application.

1: While registering an account for the first time and creating an organization, the flow does not include any steps to invite another member to the organization. The flow should be register, create organization (including a field to add logo), a form to invite members and just to serve as data collection, a form to know where users knew us from. And after this they should be redirected to another page asking them to click the verification link sent to them.

2: When a user verifies their account by clicking the link sent to their email, it redirects them to the homepage rather than the dashboard.

3: In the branding pages, instead of letting users select a pro template and click use this template, I would rather if we had the templates greyed out or something in order to prevent them in the first place, this also applies to other areas that are have a subscription wall for instance the team invites. Make them know from the start that it's a plan offering.

4: After a user upgrades their plan, there should be a confirmation email sent to the user.

5: After sending an invite to a user, the one sending the invite is redirected to the dashboard instead of them actively seeing the members list update.

6: When a user receives and invite and they do not have an account yet, they are taken through the entire onboarding workflow instead of just creating the account, accepting the invite then verifying their email, they do not have to create their own workspace since they are being invited to a workspace already.

7: An admin/owner should have the ability to revoke invited member's access and an invited member should have the ability to leave an organization.

8: Form input such as country, cities and such should have pre filled options to select from making it easier for the user, if possible the options should be dynamic based off the main selections input. Not only the two but others that should have well know options.

9: Phone number inputs should be separated in two, the country code and the number itself typed in based off how the country types their numbers, for instance in Kenya, the number is typed like this +254111893399, while in the USA the number is typed in totally different (xxx) xxx-xxxx

10: The inline product and customers forms should be complete not just the essentials, it should be a complete form where they can create an entire product from. 

11: Both the add new products and customer forms do not feature the updated form inputs such as logo, image and so forth. You updated the schema but never the forms.

12: When creating a new customer, the form should allow the user to add multiple contact persons not just one.

13: I am not sure why but the customer should also have a logo field and that should be the image to show in the overview.

14: When editing a contact person I keep getting the following error ``Too small: expected string to have >=2 characters``

15: Everytime a product edit is made, the price change is logged even when not changed.

16: After a customer receives the invoice link and then pays the invoice, the customer should be redirected to a success page rather than back to the invoice page with all the reference for the user. A confirmation email should be sent out as well. 

17: When an invoice is paid, the send email button should not appear as well as credit button.