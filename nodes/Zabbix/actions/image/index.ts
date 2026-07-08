import { createCrudResource } from '../../helpers/resourceFactory';

const resourceModule = createCrudResource({
	resource: 'image',
	displayName: 'Image',
	apiObject: 'image',
	idField: 'imageid',
	writeFields: [
		{ displayName: 'Name', name: 'name', type: 'string', default: '', description: 'Name of the image (required on create)' },
		{
			displayName: 'Type',
			name: 'imagetype',
			type: 'options',
			default: 1,
			description: 'Type of the image',
			options: [
				{ name: 'Icon', value: 1 },
				{ name: 'Background', value: 2 },
			],
		},
		{ displayName: 'Image (Base64)', name: 'image', type: 'string', default: '', description: 'Base64-encoded image data (required on create)' },
	],
});

export const description = resourceModule.description;
export const handlers = resourceModule.handlers;
